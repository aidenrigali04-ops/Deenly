Social shell icons — production workflow
==========================================

1. In Figma (file “Social Media App UI”), export each icon as SVG at 1x (or @2x PNG if you prefer).

2. Save into this folder using EXACT filenames from frontend/src/lib/figma-social-icons.ts → LOCAL_ICON_FILE
   Example: nav-home.svg, discover-search.svg, feed-like.svg, …

3. In frontend/.env.local set:
   NEXT_PUBLIC_SOCIAL_ICONS_MODE=local

4. Restart `npm run dev`. Icons load from /icons/social/* (stable, cacheable, no Figma CDN expiry).

Default (omit or set to `remote`) uses Figma MCP asset URLs; refresh UUIDs in figma-social-icons.ts when those URLs expire.
