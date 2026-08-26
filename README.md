# Ryan Borths — Portfolio

Personal portfolio site for Ryan Borths, Head of Talent Acquisition and recruiting
operating-system builder.

Static site, deployed on Vercel.

## Structure

```
index.html                              Homepage (single page, section anchors)
styles.css                              Shared design system — tokens + all components
case-studies/marketsync-ta/index.html   Case study: MarketSync TA
vercel.json                             cleanUrls so /case-studies/marketsync-ta resolves
sitemap.xml, robots.txt                 Add every new page to sitemap.xml
```

All styling lives in `styles.css` and is shared by every page. Add a new case study
by creating `case-studies/<slug>/index.html`, linking `/styles.css`, and reusing the
existing component classes (`.cs-hero`, `.decisions`, `.tools-grid`, `.boundaries`,
`.stack-rows`). Page-specific CSS goes at the bottom of `styles.css`, not inline.

Asset paths on case study pages must be absolute (`/brand-mark.png`), and homepage
anchors must be prefixed (`/#portfolio`).

Both pages carry JSON-LD in `<head>`. The homepage defines the canonical `Person`
node (`https://www.ryanborths.com/#ryan`); case studies reference it by `@id` rather
than redefining it, so bio details are edited in one place.
