# Mateus Ferreira — Portfolio

Personal portfolio of Mateus Ferreira, Senior Real-Time VFX Artist.

Live at https://bonzerkitten.github.io/portfolio/

## Structure

It is a plain static page with no build step and no libraries:

| Path | Contents |
| --- | --- |
| `index.html` | All of the page content |
| `style.css` | All of the styling |
| `script.js` | The intro shader, the navigation bar, scroll reveals and the email decoding |
| `assets/images/` | Portrait, site icon, software logos, project covers and material function thumbnails |

To preview locally, open `index.html` in a browser.

## Editing

- **Text and links** are edited directly in `index.html`.
- **Colours and spacing** are defined as variables at the top of `style.css`.
- **Videos** are hosted on Wistia. To swap one, change its media ID in the three places it appears in
  `index.html`: the `<script>` in the `<head>`, and the `media-id` and `--swatch` of its `<wistia-player>`.
- **Material functions** are one `<li>` each in the `functions` list in `index.html`, linking to the
  function's page on blueprintUE. To add one, copy a line, change the link and name, and put a square
  thumbnail in `assets/images/material-functions/`. Entries without a thumbnail use the `#icon-nodes`
  icon instead of an `<img>`.
- **The email address** is stored encoded so spam scrapers reading the page source don't find it, and
  `script.js` decodes it in the browser. To change it, paste this into a browser console with the new
  address, then put the result in the `data-email` attribute in `index.html`:

  ```js
  [90, ...[...'name@example.com'].map((c) => c.charCodeAt(0) ^ 90)].map((b) => b.toString(16).padStart(2, '0')).join('')
  ```

- **Images** are replaced by overwriting the file in `assets/images/` under the same name.
- **The link preview image** shown when the site is shared (LinkedIn, Discord, WhatsApp and so on) is
  `assets/images/share.jpg`, 1200×630 pixels. Replace it with any JPEG of that size. If the site moves to
  another address, update the `og:url` and `og:image` lines in the `<head>` of `index.html`.

## The intro effect

The background of the intro is a WebGL fragment shader in `script.js`: an erosion dissolve with a glowing
edge. A noise pattern is compared against a threshold, and wherever the noise falls below it the surface
burns away to reveal a grid underneath. The threshold is raised along two edges of the screen (left and
right on wide screens, top and bottom on phones and other narrow screens) and wherever the pointer has
recently been.

It pauses while off screen or in a background tab, shows a single still frame for visitors who have
reduced motion turned on, and is skipped entirely in browsers without WebGL 2.

## Hosting

The site is served by GitHub Pages from the root of the `main` branch, so every push to `main` publishes
automatically. The font (Raleway) is loaded from Google Fonts.
