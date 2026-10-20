# muste

**ink that answers back.**

muste is ink in Finnish. the stuff you write with, and the stain it leaves on whatever it touches.
that is the whole app: you write in the book, and the book explains itself back to you.

it is an iPad-first PWA for working through *Suomen Mestari* with the Apple Pencil. you fill in the
exercises the way you would on paper, and any word or line you point at comes back with a
translation, its base form, its case or tense, and what the ending is doing there.

I built it for one person and one textbook series, and it shows. it is public because the parts are
worth reading, not because it is a product.

## how it reads the page

the textbook PDFs are scans: one JPEG per page, no text layer. so every page goes through Tesseract
in the browser first, and a badge in the corner tells you when it is done. a tap on a word sends
that word and its line to Claude as text. a region you draw around something goes as a small crop,
because a whole exercise reads better as an image than as OCR output.

explanations stream in as they are written, and they are cached on the device by the text they were
about. tapping the same word twice costs nothing, even on a different page.

the PDFs and your ink never leave the browser. they live in IndexedDB, because the books are
copyrighted and the app has no business holding them anywhere else.

## using it

| | |
|---|---|
| Pencil, **Pen** | write. pick the colour in the dock |
| Pencil, **Erase** | removes whole strokes it touches |
| Pencil, **Explain** | drag a box, get everything inside it explained |
| Pencil, scribble over ink | erases what it covers, with any tool |
| Pencil, circle something and hold | explains what you circled |
| finger tap on a word | explains that word |
| two-finger tap | undo |
| three-finger tap | redo |
| finger drag, pinch | scroll, zoom |

the Pencil draws and fingers never do, so you can rest your hand on the page while you write.

## what else is in here

**the answer key.** the pages titled *Harjoitusten ratkaisut* at the back of the book get read once
by Claude and indexed per exercise. after that, every exercise has its answers one tap away. it costs
about $0.15 a page, once.

**the dictionary.** Wiktionary entries for any word, via [kaikki.org](https://kaikki.org), with the
full inflection tables. Sanakirja would be better, but it has no public API.

**case guides.** each of the Finnish cases gets a guide written around the word you were looking at,
so the rule arrives with an example you already care about.

**puhekieli.** a *Kirja / Puhe* toggle shows every explanation in written Finnish or in the spoken
Helsinki register, with the words that change marked. the textbook teaches one language and the
street speaks another, and you need both.

## models

words go to Sonnet 5.5, because a single word needs speed more than depth. regions, answer pages and
case guides go to Opus 5.5, because those are the ones that are easy to get subtly wrong.

## running it

Vite, React 19, TypeScript, [usva.](https://usva.build) for the interface, pdf.js for the pages and
perfect-freehand for the ink.

```sh
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local
npm run dev
```

open the `Network:` URL Vite prints on the iPad. it is https with a self-signed certificate, because
the service worker needs a secure context. accept the warning, then open a PDF from the book menu.

`npm run lint` and `npm run build` are the checks. there are no tests yet.

## deploying it

the app is static, and the three Claude calls run as Pages Functions under `functions/api`, so the
API key never reaches the browser.

built by [matt-pasek](https://matt-pasek.dev).
