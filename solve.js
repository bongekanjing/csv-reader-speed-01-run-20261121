// A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly what csv-reader 1.0.0's readCsv returns for the
// same {text, header}: {columns, rows, errors}, following its written
// broken-row policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote and each CRLF or lone CR inside it
//     read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its field count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's
//     short_row or long_row when it ends: line the 1-based line its record
//     starts on, counting every LF, CRLF and lone CR inside quotes, and row
//     its record's index in rows, null for the header.
//
// Speed comes from never building a string a character at a time: the text
// is scanned once by index, unquoted fields are taken with one slice, and a
// quoted field is segmented only where a quote or a CR forces it. The
// reference builds every field character by character, which is what makes
// it slow; this keeps the same answers with a fraction of the work.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let i = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) i = 1;

  while (true) {
    // Lines with no characters are no records.
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 10) {
        i += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(i + 1) === 10) {
        i += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (i >= n) break;

    // The record being read: the line it starts on and the index in rows it
    // takes (null: the header).
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    let fields = [];
    let ended = COMMA;
    let quoted = false;

    // Fast path: a record on one line, no field opening with a quote and no
    // stray CR, is just the line split on commas. A quote inside an unquoted
    // field is literal, so only a quote at the line's start or after a comma
    // rules the line out.
    const nl = text.indexOf('\n', i);
    const lineEnd = nl === -1 ? n : nl;
    const crAt = text.indexOf('\r', i);
    const crIsCRLF = nl !== -1 && crAt === lineEnd - 1;
    let fast = false;
    if ((crAt === -1 || crAt >= lineEnd || crIsCRLF) && text.charCodeAt(i) !== 34) {
      const qAfterComma = text.indexOf(',"', i);
      if (qAfterComma === -1 || qAfterComma >= lineEnd) {
        const contentEnd = crIsCRLF ? lineEnd - 1 : lineEnd;
        fields = text.slice(i, contentEnd).split(',');
        i = nl === -1 ? n : nl + 1;
        line += 1;
        fast = true;
      }
    }

    if (!fast) {
    do {
      if (text.charCodeAt(i) === 34) {
        // A field that opens with a quote.
        quoted = true;
        const open = i;
        const openLine = line;
        i += 1;
        let closed = false;
        let parts = null; // segments of the value, split at "" and CRs
        let seg = i;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === 34) {
            if (text.charCodeAt(i + 1) === 34) {
              if (parts === null) parts = [];
              parts.push(text.slice(seg, i), '"');
              i += 2;
              seg = i;
              continue;
            }
            closed = true;
            i += 1;
            break;
          }
          if (c === 13) {
            // CRLF and a lone CR inside quotes are each one LF.
            if (parts === null) parts = [];
            parts.push(text.slice(seg, i), '\n');
            line += 1;
            i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
            seg = i;
            continue;
          }
          if (c === 10) line += 1;
          i += 1;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          i = open + 1;
          line = openLine;
          let start = i;
          let acc = null;
          let end = n;
          ended = END;
          while (i < n) {
            const c = text.charCodeAt(i);
            if (c === 44) {
              end = i;
              i += 1;
              ended = COMMA;
              break;
            }
            if (c === 10) {
              end = i;
              i += 1;
              line += 1;
              ended = BREAK;
              break;
            }
            if (c === 13) {
              if (text.charCodeAt(i + 1) === 10) {
                end = i;
                i += 2;
                line += 1;
                ended = BREAK;
                break;
              }
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              if (acc === null) acc = [];
              acc.push(text.slice(start, i));
              i += 1;
              start = i;
              continue;
            }
            i += 1;
          }
          const tail = text.slice(start, end);
          fields.push(acc === null ? '"' + tail : '"' + acc.join('') + tail);
          continue;
        }
        const value = parts === null ? text.slice(seg, i - 1) : parts.join('') + text.slice(seg, i - 1);
        if (i >= n) {
          fields.push(value);
          ended = END;
          continue;
        }
        const c = text.charCodeAt(i);
        if (c === 44) {
          i += 1;
          fields.push(value);
          ended = COMMA;
        } else if (c === 10) {
          i += 1;
          line += 1;
          fields.push(value);
          ended = BREAK;
        } else if (c === 13 && text.charCodeAt(i + 1) === 10) {
          i += 2;
          line += 1;
          fields.push(value);
          ended = BREAK;
        } else {
          // What follows the closing quote is appended as it stands, up to
          // the next comma or line break.
          let start = i;
          let acc = null;
          let added = 0;
          let end = n;
          ended = END;
          while (i < n) {
            const c2 = text.charCodeAt(i);
            if (c2 === 44) {
              end = i;
              i += 1;
              ended = COMMA;
              break;
            }
            if (c2 === 10) {
              end = i;
              i += 1;
              line += 1;
              ended = BREAK;
              break;
            }
            if (c2 === 13) {
              if (text.charCodeAt(i + 1) === 10) {
                end = i;
                i += 2;
                line += 1;
                ended = BREAK;
                break;
              }
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              if (acc === null) acc = [];
              acc.push(text.slice(start, i));
              added += i - start;
              i += 1;
              start = i;
              continue;
            }
            i += 1;
          }
          const tail = text.slice(start, end);
          added += end - start;
          fields.push(acc === null ? value + tail : value + acc.join('') + tail);
          if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      } else {
        // An unquoted field: one slice up to the next comma or line break,
        // a CR not followed by LF dropped (stray_cr).
        quoted = false;
        let start = i;
        let acc = null;
        let end = n;
        ended = END;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === 44) {
            end = i;
            i += 1;
            ended = COMMA;
            break;
          }
          if (c === 10) {
            end = i;
            i += 1;
            line += 1;
            ended = BREAK;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(i + 1) === 10) {
              end = i;
              i += 2;
              line += 1;
              ended = BREAK;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (acc === null) acc = [];
            acc.push(text.slice(start, i));
            i += 1;
            start = i;
            continue;
          }
          i += 1;
        }
        const tail = text.slice(start, end);
        fields.push(acc === null ? tail : acc.join('') + tail);
      }
    } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
