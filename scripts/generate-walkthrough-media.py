#!/usr/bin/env python3
"""Publish approved Remotion exports as versioned portfolio video assets."""

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIDEO_STUDIO_DEFAULT = ROOT.parent / "my-video2"
SPECS = {
    "recruiting-control-room": {
        "id": "recruiting-control-room-walkthrough",
        "title": "Recruiting Control Room",
        "headline": "From recruiting signals to reviewed decisions",
        "description": "A narrated tour of structured intake, calibration, approval gates, funnel health, and weekly leadership review in a synthetic recruiting prototype.",
        "app_url": "/recruiting-control-room/demo/index.html#intake",
        "app_label": "Open the demo",
        "support_url": "/recruiting-control-room/",
        "support_label": "Read the case study",
        "segments": ("intake", "funnel", "weekly"),
        "synthetic": "Portfolio prototype · Synthetic data · AI-generated narration",
    },
    "marketsync-ta": {
        "id": "marketsync-ta-walkthrough",
        "title": "MarketSync TA",
        "headline": "Prepare a better hiring conversation",
        "description": "A narrated tour of labor-market research, methodology checks, hiring-manager intake, relocation calibration, and synthetic-data quality controls.",
        "app_url": "https://marketsync-ta-663237649522.us-central1.run.app/",
        "app_label": "Open the live app",
        "support_url": "/case-studies/marketsync-ta",
        "support_label": "Read the case study",
        "segments": ("market", "intake", "relocation"),
        "synthetic": "Portfolio demo · Provider data, estimates, and sandbox · Synthetic candidates · AI-generated narration",
    },
    "workforce-demand-capacity-lab": {
        "id": "workforce-capacity-walkthrough",
        "title": "Workforce Demand & Capacity Lab",
        "headline": "Make hiring-plan tradeoffs visible",
        "description": "A narrated tour of the synthetic planning model, month-by-month feasibility, capacity scenarios, phasing options, and executive decision memo.",
        "app_url": "/workforce-demand-capacity-lab/",
        "app_label": "Open the interactive lab",
        "support_url": "/workforce-demand-capacity-lab/docs/model-methodology.html",
        "support_label": "Review the methodology",
        "segments": ("monthly", "capacity", "memo"),
        "synthetic": "Synthetic portfolio model · Weighted planning units · AI-generated narration · Human judgment",
    },
}


def latest_approved(studio: Path, video_id: str):
    reviews_path = studio / ".video-state" / video_id / "reviews.json"
    timeline_path = studio / "public" / "videos" / video_id / "timeline.json"
    timeline = json.loads(timeline_path.read_text())
    reviews = json.loads(reviews_path.read_text())
    node_hash_script = "const fs=require('fs'),c=require('crypto'); const x=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(c.createHash('sha256').update(JSON.stringify(x)).digest('hex'))"
    timeline_hash = subprocess.run(
        ["node", "-e", node_hash_script], input=json.dumps(timeline), text=True,
        check=True, capture_output=True,
    ).stdout
    if timeline_hash != reviews.get("final"):
        raise RuntimeError(f"Current video timeline no longer matches Ryan's final approval: {video_id}")
    matches = []
    for export_path in (studio / "out" / video_id).glob("*/export.json"):
        export = json.loads(export_path.read_text())
        if (export.get("reviewed") and export.get("draft") is False
                and export.get("hasAudio") is True and not export.get("issues")
                and export.get("timelineHash") == reviews.get("final")
                and export.get("timelineHash") == timeline_hash):
            matches.append((export.get("createdAt", ""), export_path.parent, export))
    if not matches:
        raise RuntimeError(f"No final-approved, narrated export matches the current timeline: {video_id}")
    return max(matches, key=lambda row: row[0])


def seconds_to_vtt(timestamp: str) -> str:
    return timestamp.replace(",", ".")


def to_vtt(srt: str) -> str:
    return "WEBVTT\n\n" + re.sub(
        r"(\d{2}:\d{2}:\d{2}),([0-9]{3}) --> (\d{2}:\d{2}:\d{2}),([0-9]{3})",
        lambda m: f"{seconds_to_vtt(m[1])}.{m[2]} --> {seconds_to_vtt(m[3])}.{m[4]}",
        srt.strip(),
    ) + "\n"


def duration_iso(seconds: float) -> str:
    total = round(seconds)
    minutes, secs = divmod(total, 60)
    return f"PT{minutes}M{secs}S" if minutes else f"PT{secs}S"


def generate_page(slug: str, spec: dict, timeline: dict, export: dict,
                  asset_base: str, captions_name: str) -> str:
    title = html.escape(spec["title"])
    headline = html.escape(spec["headline"])
    description = html.escape(spec["description"])
    app_url = html.escape(spec["app_url"], quote=True)
    support_url = html.escape(spec["support_url"], quote=True)
    app_label = html.escape(spec["app_label"])
    support_label = html.escape(spec["support_label"])
    disclosure = html.escape(spec["synthetic"])
    url = f"https://www.ryanborths.com/walkthroughs/{slug}"
    poster = f"{asset_base}/poster.png"
    media = f"{asset_base}/full.mp4"
    duration = duration_iso(export["durationSeconds"])
    duration_seconds = round(export["durationSeconds"])
    duration_display = f"{duration_seconds // 60}:{duration_seconds % 60:02d}"
    scenes = "\n".join(
        f"<li><strong>{html.escape(scene['title'])}</strong><br>{html.escape(scene['narration'])}</li>"
        for scene in timeline["scenes"]
    )
    structured = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": f"{spec['title']} — app walkthrough",
        "description": spec["description"],
        "thumbnailUrl": f"https://www.ryanborths.com{poster}",
        "uploadDate": date.today().isoformat(),
        "duration": duration,
        "contentUrl": f"https://www.ryanborths.com{media}",
        "embedUrl": url,
        "publisher": {"@id": "https://www.ryanborths.com/#ryan"},
        "inLanguage": "en",
    }
    structured_text = json.dumps(structured, ensure_ascii=False).replace("</", "<\\/")
    external = " target=\"_blank\" rel=\"noopener noreferrer\"" if app_url.startswith("https:") else ""
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} walkthrough — Ryan Borths</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{url}">
  <link rel="stylesheet" href="/styles.css">
  <meta name="theme-color" content="#0a1628">
  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="Ryan Borths">
  <meta property="og:title" content="{title} walkthrough — Ryan Borths">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="https://www.ryanborths.com{poster}">
  <meta property="og:video" content="https://www.ryanborths.com{media}">
  <meta property="og:video:type" content="video/mp4">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{structured_text}</script>
</head>
<body class="walkthrough-page">
  <nav class="nav"><div class="wrap nav-inner">
    <a class="brand" href="/" aria-label="Ryan Borths — home"><img class="brand-mark" src="/brand-mark.png" alt="" width="64" height="44"><span>Ryan Borths</span></a>
    <a class="walkthrough-back" href="/#featured-builds">← All featured builds</a>
  </div></nav>
  <main id="main" class="walkthrough-main wrap">
    <a class="walkthrough-skip" href="#walkthrough-video">Skip to video</a>
    <p class="eyebrow">App walkthrough · {duration_display}</p>
    <h1>{title}</h1>
    <h2 class="walkthrough-headline">{headline}</h2>
    <p class="walkthrough-description">{description}</p>
    <div class="walkthrough-actions">
      <a class="btn btn-primary" href="{app_url}"{external}>{app_label} <span class="arrow">→</span></a>
      <a class="btn btn-ghost" href="{support_url}">{support_label}</a>
    </div>
    <p class="walkthrough-disclosure">{disclosure}</p>
    <figure class="walkthrough-player" id="walkthrough-video">
      <video controls playsinline preload="metadata" poster="{poster}" aria-label="{title} narrated walkthrough">
        <source src="{media}" type="video/mp4">
        <track kind="captions" src="{asset_base}/{captions_name}" srclang="en" label="English" default>
        Your browser does not support HTML video. <a href="{media}">Download the narrated walkthrough.</a>
      </video>
      <figcaption>About {round(export['durationSeconds'])} seconds · AI-generated Cedar narration · English captions on</figcaption>
    </figure>
    <details class="walkthrough-transcript"><summary>Read the narration</summary><ol>{scenes}</ol></details>
  </main>
  <footer class="walkthrough-footer"><div class="wrap"><a href="/#featured-builds">← Back to the portfolio</a><span>Designed by Ryan Borths</span></div></footer>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", type=Path, default=VIDEO_STUDIO_DEFAULT,
                        help="local Remotion studio used to locate approved exports")
    args = parser.parse_args()
    studio = args.studio.expanduser().resolve()
    remotion = studio / "node_modules" / ".bin" / "remotion"
    if not remotion.is_file():
        parser.error(f"Remotion CLI not found at {remotion}; pass --studio with the studio root")

    for slug, spec in SPECS.items():
        video_id = spec["id"]
        _, export_dir, export = latest_approved(studio, video_id)
        timeline = json.loads((studio / "public" / "videos" / video_id / "timeline.json").read_text())
        source_video = export_dir / "clean.mp4"
        source_poster = export_dir / "thumbnail.png"
        source_srt = export_dir / "captions.srt"
        for path in (source_video, source_poster, source_srt):
            if not path.is_file() or not path.stat().st_size:
                raise RuntimeError(f"Approved export is missing a required asset: {path}")

        version = export["timelineHash"][:12]
        asset_dir = ROOT / "media" / "walkthroughs" / slug / version
        asset_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_video, asset_dir / "full.mp4")
        shutil.copy2(source_poster, asset_dir / "poster.png")
        (asset_dir / "captions.vtt").write_text(to_vtt(source_srt.read_text()))

        scene_by_id = {scene["id"]: scene for scene in timeline["scenes"]}
        filters = []
        labels = []
        for index, scene_id in enumerate(spec["segments"]):
            scene = scene_by_id[scene_id]
            start = scene["from"] / timeline["fps"] + 1
            filters.append(f"[{index}:v]scale=1280:720,format=yuv420p[v{index}]")
            labels.append(f"[v{index}]")
        filters.append(f"{''.join(labels)}concat=n=3:v=1:a=0[outv]")
        preview = asset_dir / "preview.mp4"
        command = [str(remotion), "ffmpeg", "-y"]
        for scene_id in spec["segments"]:
            scene_start = scene_by_id[scene_id]["from"] / timeline["fps"] + 1
            command.extend(["-ss", f"{scene_start:.6f}", "-t", "3", "-i", str(source_video)])
        command.extend([
            "-filter_complex", ";".join(filters), "-map", "[outv]", "-an",
            "-c:v", "libx264", "-preset", "fast", "-crf", "30",
            "-movflags", "+faststart", str(preview),
        ])
        subprocess.run(command, check=True, cwd=studio)
        while preview.stat().st_size > 3 * 1024 * 1024:
            current_crf = int(command[command.index("-crf") + 1])
            if current_crf >= 36:
                raise RuntimeError(f"Muted preview exceeds 3 MiB after compression: {preview}")
            command[command.index("-crf") + 1] = str(current_crf + 2)
            subprocess.run(command, check=True, cwd=studio)

        page_dir = ROOT / "walkthroughs" / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        asset_base = f"/media/walkthroughs/{slug}/{version}"
        page = generate_page(slug, spec, timeline, export, asset_base, "captions.vtt")
        (page_dir / "index.html").write_text(page)
        print(f"{slug}: approved {version}; preview {preview.stat().st_size / 1024:.0f} KiB; {source_video.stat().st_size / 1024 / 1024:.1f} MiB full video")


if __name__ == "__main__":
    try:
        main()
    except (OSError, KeyError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
