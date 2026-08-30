# Appearance Preview Renderer

The frontend sends preview requests to:

```text
/api/maple/appearance-preview.svg
```

This API does not render MapleStory avatars by itself. It normalizes the preview
spec and redirects to the configured avatar renderer.

## Required environment variable

```text
MAPLE_PREVIEW_RENDERER_URL_TEMPLATE=https://renderer.example/avatar?type={type}&gender={gender}&hair={hair}&face={face}&skin={skin}&outfit={outfit}&hairName={hairName}&faceName={faceName}
```

Supported template tokens:

```text
{type}
{gender}
{hair}
{face}
{skin}
{outfit}
{hairName}
{faceName}
{skinName}
{outfitName}
```

The renderer URL must return an image that can be used directly in an `<img>`
tag, such as PNG, WEBP, or SVG.

If `MAPLE_PREVIEW_RENDERER_URL_TEMPLATE` is not set, the endpoint returns a
placeholder SVG that says the renderer is not configured.
