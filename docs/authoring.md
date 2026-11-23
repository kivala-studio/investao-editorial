# Authoring

An article is a title, a URL slug, a summary, a Markdown body, a status, and links to sources, categories and securities (`src/lib/types.ts`). The body can be typed in the editor or imported from a `.md` file. Parsing, validation and normalisation live in `src/lib/markdown.ts`; the editor is `src/components/article-editor.tsx`.

## File import

`parseUpload(filename, text)` accepts a file when all of these hold (`src/lib/markdown.ts:91-147`):

- The name ends in `.md` (case-insensitive).
- The UTF-8 size is at most 262 144 bytes (256 KB). The editor also checks `File.size` first.
- The text contains no NUL character.
- After removing front matter and trimming, the body is not empty.

A leading byte order mark is removed and `\r\n` / `\r` become `\n`.

Nothing is stored on import. The file's content is copied into the editor state and is only sent to the backend on save (`article-editor.tsx:62-123`). The uploaded file itself is never sent anywhere.

## Front matter

Front matter is optional. It is recognised only when the file starts with a line containing exactly `---`, and it must be closed by another `---` line. It is parsed as YAML with duplicate keys rejected. It must be a mapping (or empty).

| Key | Type | Effect in the editor |
| --- | --- | --- |
| `title` | text | Replaces the title when not empty. If the slug field is empty, the slug is generated from it. |
| `summary` | text | Replaces the summary when not empty. |
| `category` | text | Matched against category names, case-insensitive. A match replaces the selected categories with that one category. |
| `securities` | list of text | Each entry is matched against security symbols, case-insensitive. When the list is not empty it replaces the related securities. |
| `sources` | list of mappings | When the list is not empty it replaces the article's sources. |

Each `sources` entry:

| Key | Type | Notes |
| --- | --- | --- |
| `name` | text | Matched against source names, case-insensitive. Also copied into the source's reference title. |
| `url` | text | When present it must pass the URL rule below. |
| `primary` | boolean | Optional; anything other than `true` is treated as false. A non-boolean value is rejected. |

Other keys are ignored. A value of the wrong type is rejected with an error naming the field (for example `title: 2026` fails because it is a number).

Names that do not match anything do not fail the import. The editor lists them above the form ("Category … was not found", "Security … was not found", "Source … needs to be created or selected below") and the editor has to fix them by hand. An unmatched source is kept with an empty source selection, which blocks publication until one is chosen.

Example (from `src/lib/markdown.test.ts`):

```markdown
---
title: BFA
summary: Summary
category: Dividendos
securities: [BFAAAAA]
sources:
  - name: BODIVA
    url: https://bodiva.ao/notice
    primary: true
---
## Pagamento

**Texto**
```

A file without front matter is also valid; `tests/fixtures/august-2026.md` is one.

## URL rule

`safeURL` (`src/lib/markdown.ts:18-29`) accepts a value only when it parses as an absolute URL, its scheme is `http:` or `https:`, and it has no username or password. It is applied to front matter source URLs, to links in the body, to source URLs at publication and to links in the preview.

## Supported Markdown

`validateMarkdown` parses the body with `remark-parse` (CommonMark, no extensions) and reports a warning for anything outside this set (`src/lib/markdown.ts:30-84`):

- Headings
- Paragraphs
- Bold and italic
- Links with a URL that passes the URL rule
- Ordered and unordered lists, one level deep, one plain paragraph per item
- Blockquotes containing plain paragraphs only
- Horizontal rules
- Hard line breaks (accepted, then turned into spaces on save)

Everything else is reported as `Unsupported Markdown: <node type>`. That includes raw HTML, images, fenced or indented code, inline code, and reference-style links and definitions. Nested lists, list items with more than one paragraph or with non-paragraph content, and blockquotes containing anything but paragraphs have their own messages.

Tables are not supported: without a table extension the parser reads a pipe table as an ordinary paragraph, and normalisation then joins its lines.

Warnings are shown under the body field as the editor types. They block publication, not saving a draft.

## Normalisation

`normalizeMarkdown` rewrites the body before every save, on import and before preview (`src/lib/markdown.ts:176-194`):

- Bullets become `-`, rules become `---`, emphasis `*text*`, strong `**text**`, list items indented by one space.
- Setext headings become `#` headings.
- Hard line breaks become a single space.
- Line breaks inside a paragraph become a single space.
- Leading and trailing whitespace is trimmed.

Example from the tests: `Heading\n=======\n\n- wrapped\n  item\n\nA  \nline` becomes `# Heading\n\n- wrapped item\n\nA line`.

## Slug

The slug must match `^[a-z0-9]+(-[a-z0-9]+)*$` before any save, including drafts (`article-editor.tsx:127`). `slugify` builds one from the title by stripping diacritics, lower-casing and replacing every run of other characters with `-` (`src/lib/markdown.ts:167-174`). The editor fills the slug automatically only for a new article whose slug is still empty; "From title" regenerates it on demand.

## Publication checks

`publicationErrors` runs when the target status is `published` (`src/lib/markdown.ts:148-166`):

- Title, summary and body are not blank.
- At least one source is attached.
- Every source has a selected source and a URL that passes the URL rule.
- The body has no validation warnings.

Field limits in the form: title 300 characters, summary 2000, reference title 300, new source name 200.

## Preview

`src/components/preview.tsx` renders the normalised body with `react-markdown`, with raw HTML skipped, an explicit element allow-list and unsafe link URLs blanked. It is a preview inside the portal, not the rendering used by the apps.

## Period recaps

A period recap is an article with four extra fields: `recap_period` (`weekly`, `monthly` or `annual`), `period_start`, `period_end` and an optional `reference_session` (`src/lib/types.ts:16-19`). It is created from the Market recaps screen ("Criar recap por período") and uses the same editor, with the period fields added (`src/components/period-recaps.tsx`, `article-editor.tsx:211-269`). New period recaps start as `monthly`.

`periodErrors` (`src/lib/periods.ts:12-64`) runs before every save of a period recap:

- Start and end must be real dates in `YYYY-MM-DD` form.
- The reference session, when given, must be a real date.
- The period must be a whole civil period: a week from Monday to Sunday, a calendar month from its first to its last day, or a calendar year from 1 January to 31 December.
- The reference session, when given, must fall inside the period.
- Publishing requires a completed period, judged on the current date in `Africa/Luanda`: a week can be published from the Saturday of that week; a month or year only after its last day.
- Publishing is refused when the reference session is in the future.

Leaving the reference session empty marks the recap as aggregate data. `periodBasis` then describes it as `Base agregada semanal|mensal|anual; sem sessão específica`; otherwise as `Sessão de referência: <date>` (`src/lib/periods.ts:66-76`).

The backend adds a notice line to the start of a period recap's stored body; see [publishing.md](publishing.md#period-recaps).

The daily "Fechos das acções" recaps on the same screen are not authored as Markdown. Their text is generated by the backend from reviewed figures; see [publishing.md](publishing.md#daily-recaps).

## Not verified

- That `normalizeMarkdown` leaves the backend's period notice line byte-for-byte unchanged when a saved period draft is edited and saved again. The backend only strips the notice when the body starts with it exactly.
