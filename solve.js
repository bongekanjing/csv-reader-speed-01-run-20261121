// Fast drop-in for make.fun's csv-reader 1.0.0.
//
// Same answers as csv-reader 1.0.0's readCsv for every input {text, header}:
// {columns, rows, errors}. Written from the reference's stated policy (RULES.txt)
// and its code, then re-implemented with index-based scanning instead of the
// reference's character-at-a-time loop:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled ("" inside it is one quote, each CRLF or lone CR inside it is
//     read as LF); what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded (short_row, with fields: its field
//     count) or cut (long_row, with extra: the cut fields) to the first
//     record's width;
//   - each error is {code, line, row}, in the order met: line the 1-based
//     line its record starts on, row its record's index in rows (null for the
//     header).
//
// Speed comes from never reading a character twice in the common case:
// unquoted fields are taken as slices between indexOf(',', '\n') hits, quoted
// fields as slices between the opening quote and the next non-doubled quote,
// and a whole record whose line holds no quote and no stray CR is split at
// once. The rare paths (stray CRs, doubled quotes, quoted line breaks, junk
// after a closing quote, an unterminated quote) fall back to careful code
// that follows the reference step by step.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Finish one parsed record: drop it when it held only stray CRs, else make
  // it the header or a row at the first record's width.
  function finish(fields, quoted, recordLine, recordRow) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;

    // The next LF at or after this record's start (n: none); the first LF
    // after a field start, cached across the record's unquoted fields (an
    // unquoted field never passes one) and recomputed after a quoted field.
    let le = text.indexOf('\n', pos);
    if (le === -1) le = n;

    // Fast path: this record's line holds no quote and no stray CR, so the
    // record is one line split on commas.
    const qAt = text.indexOf('"', pos);
    if (qAt === -1 || qAt >= le) {
      const rAt = text.indexOf('\r', pos);
      if (rAt === -1 || rAt >= le || (le !== n && rAt === le - 1)) {
        const lineText = le !== n && rAt === le - 1 ? text.slice(pos, le - 1) : text.slice(pos, le);
        finish(lineText.split(','), false, recordLine, recordRow);
        pos = le === n ? n : le + 1;
        line += 1;
        continue;
      }
    }

    // Generic path: parse the record field by field.
    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      let value = '';
      let scanUnquoted = !quoted;
      let isJunk = false;
      if (quoted) {
        const open = pos;
        const openLine = line;
        pos += 1;
        let segStart = pos;
        let parts = null;
        let closeQ = -1;
        while (true) {
          const q = text.indexOf('"', pos);
          if (q === -1) break;
          if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
            if (parts === null) parts = [];
            parts.push(text.slice(segStart, q + 1));
            pos = q + 2;
            segStart = q + 2;
            continue;
          }
          closeQ = q;
          break;
        }
        le = -1; // a quoted field may hold line breaks: relearn the next LF
        if (closeQ === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
          scanUnquoted = true;
        } else {
          let content;
          if (parts === null) {
            content = text.slice(open + 1, closeQ);
          } else {
            parts.push(text.slice(segStart, closeQ));
            content = parts.join('');
          }
          // Line breaks inside the quotes: every LF, CRLF and lone CR in
          // the raw content is one line. Once CRs are turned into LFs
          // below, each of those is exactly one LF in the content.
          if (content.indexOf('\r') !== -1) {
            content = content.replace(/\r\n?/g, '\n');
          }
          if (content.indexOf('\n') !== -1) {
            const breaks = content.match(/\n/g);
            if (breaks !== null) line += breaks.length;
          }
          pos = closeQ + 1;
          if (pos >= n) {
            value = content;
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              value = content;
              ended = COMMA;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              value = content;
              ended = LINE_BREAK;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              value = content;
              ended = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands.
              value = content;
              scanUnquoted = true;
              isJunk = true;
            }
          }
        }
      }
      if (scanUnquoted) {
        // Read unquoted characters onto `value` up to the next comma or
        // line break; a CR not followed by LF is dropped (stray_cr).
        let added = 0;
        while (true) {
          if (le < pos) {
            le = text.indexOf('\n', pos);
            if (le === -1) le = n;
          }
          const comma = text.indexOf(',', pos);
          let end = n;
          let endKind = END;
          if (comma !== -1 && comma < le) {
            end = comma;
            endKind = COMMA;
          } else if (le < n) {
            end = le;
            endKind = LINE_BREAK;
          }
          let segEnd = end;
          if (endKind === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) {
            segEnd = end - 1;
          }
          const seg = text.slice(pos, segEnd);
          if (seg.indexOf('\r') === -1) {
            value += seg;
            added += seg.length;
            if (endKind === COMMA) {
              pos = end + 1;
              ended = COMMA;
            } else if (endKind === LINE_BREAK) {
              pos = end + 1;
              line += 1;
              ended = LINE_BREAK;
            } else {
              pos = n;
              ended = END;
            }
            break;
          }
          // A stray CR sits inside this stretch: re-read it a character at
          // a time, dropping stray CRs and recording them.
          let v = value;
          ended = END;
          while (pos < n) {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              ended = COMMA;
              break;
            }
            if (c === 10) {
              pos += 1;
              line += 1;
              ended = LINE_BREAK;
              break;
            }
            if (c === 13) {
              if (text.charCodeAt(pos + 1) === 10) {
                pos += 2;
                line += 1;
                ended = LINE_BREAK;
                break;
              }
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              pos += 1;
              continue;
            }
            v += text[pos];
            added += 1;
            pos += 1;
          }
          value = v;
          break;
        }
        if (isJunk && added > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }
      fields.push(value);
    } while (ended === COMMA);

    finish(fields, quoted, recordLine, recordRow);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
