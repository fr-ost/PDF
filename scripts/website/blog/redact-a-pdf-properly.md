---
title: "How to Redact a PDF Properly: Why Black Boxes Are Not Enough"
description: Drawing a black rectangle over text does not remove it. Learn how real PDF redaction works and how to redact names, numbers and areas safely.
date: 2026-11-08
tag: Security
---
Every so often a "redacted" document makes the news because the hidden text could simply be copied out from under the black boxes. The problem is almost always the same: someone covered the text instead of removing it.

This guide explains the difference, and how to redact a PDF properly in Chrome with Unique PDF.

## Covering is not redacting

A PDF page is made of layers of content. When you draw a black rectangle in a typical PDF viewer or editor, you add a new shape on top of the page. The text underneath is still there. Anyone can often:

- select and copy it,
- find it with the search box,
- delete the rectangle, or
- read it with a text extraction tool.

Real redaction removes the information from the file itself, so there is nothing left to recover.

## How Unique PDF redacts

When you redact with Unique PDF, the pages you marked are rebuilt without the sensitive content: the areas you selected become solid boxes, and the original text, images and drawings underneath are removed from the file. Then Unique PDF **checks the result**, looking for the redacted words in the new file, and tells you if anything survived.

Two options give you control over the rest of the page:

- **Keep other text searchable** rebuilds an invisible text layer for the parts of the page outside your boxes, so the document stays searchable without the redacted words.
- **Remove hidden information** deletes data that could repeat the redacted content elsewhere in the file, such as document details, bookmarks, attachments, scripts and tags.

## Step by step

1. **Open Redact PDF** from the Unique PDF quick menu or the Security section.
2. **Add your document.**
3. **Find what to remove.** Type a name, number or word in the search box and click Search, then Mark all, or mark matches one by one. Use Match case and Whole words for precise results.
4. **Draw boxes by hand** for anything search cannot find, such as a signature, a photo or a stamp.
5. **Review.** Page through the document and check every marked area.
6. **Click Redact** and confirm. Unique PDF builds the new file and verifies it.
7. **Download** the redacted copy. Your original is not changed, so keep it somewhere safe or delete it, as appropriate.

## A redaction checklist

- Search for every variation: full names and initials, account numbers with and without spaces, email addresses and phone numbers.
- Check headers, footers and small print, not just the body text.
- Remember images: a scanned signature or an ID photo is not text and needs a hand-drawn box.
- Leave **Remove hidden information** switched on unless you have a reason not to.
- Open the result and try to search for a redacted word yourself. It should not be found.

## Private from start to finish

Redaction usually involves the most sensitive documents you have. Uploading them to an online service to remove private information defeats the purpose. Unique PDF processes everything in your browser on your own computer; nothing is uploaded at any point.

## Related guides

- [Why you should stop uploading private PDFs to online converters](/blog/stop-uploading-private-pdfs)
- [How to sign a PDF in Chrome](/blog/sign-a-pdf-in-chrome)
