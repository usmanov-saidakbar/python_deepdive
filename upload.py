#!/usr/bin/env python3
"""Uploads a local course folder to the Telegram channel, reproducing the
exact posting pattern already used for Parts 1-3 (reverse-engineered from
the live channel history, message by message). This is a Python port of
upload.js for anyone who'd rather run it with Telethon than Node/GramJS —
they share the same .env, and TG_SESSION works with either (GramJS's
StringSession format is deliberately compatible with Telethon's).

Pattern:
  1. One part-level intro message:
       Python 3 Deep Dive (Part 4 - OOP)

       15 sections, 165 videos, 483 files

       Contents:
       01. Introduction - 2 videos
       ...

       #Python_3_Deep_Dive_Part_4_OOP

  2. Per section, one header message:
       02. Classes
       Python 3 Deep Dive (Part 4 - OOP)

       #Python_3_Deep_Dive_Part_4_OOP #S02

  3. Per lesson: the video (or, for a video-less lecture, its html/pdf) as
     its own message, then any resource files for that lesson sent
     together as one album:
       3. Objects and Classes - Coding
       02. Classes

       #S02 #S02_L03 #Objects_and_Classes_Coding

       3. Objects-and-Classes.ipynb
       #S02_L03

Run this yourself, in your own terminal (never paste anything from it into
a chat) — it reuses the TG_SESSION already in .env, from the one-time
`npm run login` (or a Telethon login of your own).

Install dependencies once:
    pip install telethon python-dotenv

Usage:
    python upload.py --dir "D:\\Udemy - Python 3 Deep Dive (Part 4 - OOP) (12.2022)" \\
        --part 4 --subtitle "OOP" --dry-run

Options:
    --dir PATH          Course folder (required). Its immediate subfolders
                         are the sections, e.g. "01 - Introduction".
    --part N            Part number, e.g. 4 (required).
    --subtitle TEXT      Short subtitle for "(Part N - <subtitle>)",
                         matching how parts 1-3 are named (required).
    --dry-run            Print every caption/order without touching
                         Telegram or reading TG_SESSION. Do this first.
    --from-section N     Manually skip sections before this one (1-based).
                         Overrides any auto-resume from a saved progress
                         file. Use with --from-lesson.
    --from-lesson N      Within --from-section, skip lessons before this
                         one (1-based). Ignored for later sections.
    --restart            Ignore any saved progress for this --part and
                         start over from the very beginning.
    --delay-ms N         Pause between messages, default 2000. Keeps well
                         clear of flood limits for a user account (as
                         opposed to a bot, which gets more headroom).

Crash recovery: after every lesson is fully sent, progress is saved to
upload_progress_part<N>.json next to this script. If the process dies
(network drop, terminal closed, power loss, etc.), just re-run the exact
same command — it picks up right after the last completed lesson
automatically, no flags needed. The file is deleted once the part finishes
uploading. Pass --restart to ignore it and re-upload everything instead.
"""
import argparse
import json
import os
import re
import struct
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PRIMARY_PRIORITY = ["mp4", "html", "htm", "pdf"]
PRIMARY_EMOJI = {"mp4": "🎬", "html": "🌐", "htm": "🌐", "pdf": "📄"}
RESOURCE_EMOJI = {"vtt": "📝", "srt": "📝", "pdf": "📄", "zip": "💻", "html": "🌐", "htm": "🌐"}


def slug_tag(text: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^A-Za-z0-9]+", "_", text))


def emoji_for(ext: str) -> str:
    return RESOURCE_EMOJI.get(ext.lower(), "📎")


@dataclass
class FileItem:
    path: Path
    ext: str
    title: str


@dataclass
class Lesson:
    num: int
    primary: FileItem
    resources: list = field(default_factory=list)

    @property
    def is_video(self) -> bool:
        return self.primary.ext.lower() == "mp4"


@dataclass
class Section:
    num_str: str
    title: str
    section_caption: str
    lessons: list


LEADING_NUMBER_RE = re.compile(r"^(\d+)\s+(.+)$")
SECTION_FOLDER_RE = re.compile(r"^(\d+)\s*-\s*(.+)$")


def parse_leading_number(name_without_ext: str):
    m = LEADING_NUMBER_RE.match(name_without_ext)
    if not m:
        return None
    return int(m.group(1)), m.group(2).strip()


def read_mp4_meta(path: Path):
    """Reads duration/width/height out of an mp4's moov atom, so uploaded
    videos get a real streaming preview instead of a bare document. Falls
    back to zeros if the file doesn't parse as expected."""
    try:
        with open(path, "rb") as f:
            size = path.stat().st_size
            duration = 0
            timescale = 1
            width = 0
            height = 0

            def read_boxes(offset, end):
                nonlocal duration, timescale, width, height
                pos = offset
                while pos + 8 <= end:
                    f.seek(pos)
                    header = f.read(8)
                    if len(header) < 8:
                        break
                    box_size = struct.unpack(">I", header[0:4])[0]
                    box_type = header[4:8].decode("ascii", errors="replace")
                    header_size = 8
                    if box_size == 1:
                        large = f.read(8)
                        box_size = struct.unpack(">Q", large)[0]
                        header_size = 16
                    elif box_size == 0:
                        box_size = end - pos
                    box_end = pos + box_size

                    if box_type in ("moov", "trak", "mdia"):
                        read_boxes(pos + header_size, box_end)
                    elif box_type == "mvhd":
                        f.seek(pos + header_size)
                        body = f.read(box_size - header_size)
                        version = body[0]
                        if version == 1:
                            timescale = struct.unpack(">I", body[20:24])[0]
                            duration = struct.unpack(">Q", body[24:32])[0]
                        else:
                            timescale = struct.unpack(">I", body[12:16])[0]
                            duration = struct.unpack(">I", body[16:20])[0]
                    elif box_type == "tkhd" and width == 0:
                        f.seek(pos + header_size)
                        body = f.read(box_size - header_size)
                        version = body[0]
                        w_offset = 88 if version == 1 else 76
                        width = struct.unpack(">I", body[w_offset : w_offset + 4])[0] >> 16
                        height = struct.unpack(">I", body[w_offset + 4 : w_offset + 8])[0] >> 16

                    pos = box_end

            read_boxes(0, size)
            return (round(duration / timescale) if timescale else 0, width, height)
    except Exception:
        return (0, 0, 0)


def scan_course(course_dir: Path):
    folder_names = sorted(p.name for p in course_dir.iterdir() if p.is_dir())
    sections = []
    for folder_name in folder_names:
        sep_match = SECTION_FOLDER_RE.match(folder_name)
        if not sep_match:
            raise ValueError(f'Section folder "{folder_name}" doesn\'t start with "NN - ..."')
        num_str = sep_match.group(1).zfill(2)
        title = sep_match.group(2).strip()
        section_caption = f"{num_str}. {title}"

        folder_path = course_dir / folder_name
        groups = {}
        for file_path in folder_path.iterdir():
            if not file_path.is_file():
                continue
            ext = file_path.suffix.lstrip(".")
            base = file_path.stem
            parsed = parse_leading_number(base)
            if not parsed:
                continue
            num, item_title = parsed
            groups.setdefault(num, []).append(FileItem(file_path, ext, item_title))

        lessons = []
        for num in sorted(groups.keys()):
            files = groups[num]
            primary = None
            for ext in PRIMARY_PRIORITY:
                primary = next((f for f in files if f.ext.lower() == ext), None)
                if primary:
                    break
            if primary is None:
                primary = files[0]
            resources = [f for f in files if f is not primary]
            lessons.append(Lesson(num=num, primary=primary, resources=resources))

        sections.append(Section(num_str=num_str, title=title, section_caption=section_caption, lessons=lessons))
    return sections


def video_count(section: Section) -> int:
    return sum(1 for l in section.lessons if l.is_video)


def build_intro_caption(sections, part, subtitle):
    total_videos = sum(video_count(s) for s in sections)
    total_files = sum(1 + len(l.resources) for s in sections for l in s.lessons)
    lines = []
    for s in sections:
        n = video_count(s)
        lines.append(f"📂 {s.section_caption} — {n} video{'' if n == 1 else 's'}")
    tag = slug_tag(f"Python 3 Deep Dive Part {part} {subtitle}")
    return (
        f"🎓 Python 3 Deep Dive (Part {part} - {subtitle})\n\n"
        f"📚 {len(sections)} sections · 🎬 {total_videos} videos · 📎 {total_files} files\n\n"
        f"Contents:\n" + "\n".join(lines) + f"\n\n#{tag}"
    )


def build_section_caption(section: Section, part, subtitle):
    tag = slug_tag(f"Python 3 Deep Dive Part {part} {subtitle}")
    return f"📂 {section.section_caption}\n🎓 Python 3 Deep Dive (Part {part} - {subtitle})\n\n#{tag} #S{section.num_str}"


def build_primary_caption(lesson: Lesson, section: Section):
    lesson_num_str = str(lesson.num).zfill(2)
    emoji = PRIMARY_EMOJI.get(lesson.primary.ext.lower(), "📎")
    return (
        f"{emoji} {lesson.num}. {lesson.primary.title}\n📂 {section.section_caption}\n\n"
        f"#S{section.num_str} #S{section.num_str}_L{lesson_num_str} #{slug_tag(lesson.primary.title)}"
    )


def build_resource_caption(resource: FileItem, lesson: Lesson, section: Section):
    lesson_num_str = str(lesson.num).zfill(2)
    return f"{emoji_for(resource.ext)} {lesson.num}. {resource.title}\n#S{section.num_str}_L{lesson_num_str}"


def dry_run(sections, part, subtitle):
    print("===== part intro =====")
    print(build_intro_caption(sections, part, subtitle))
    for section in sections:
        print(f"\n===== section {section.num_str} header =====")
        print(build_section_caption(section, part, subtitle))
        for lesson in section.lessons:
            print(f"\n--- primary: {lesson.primary.path.name} ---")
            print(build_primary_caption(lesson, section))
            for r in lesson.resources:
                print(f"--- resource: {r.path.name} ---")
                print(build_resource_caption(r, lesson, section))


def progress_file_path(part: int) -> Path:
    return Path(__file__).with_name(f"upload_progress_part{part}.json")


def load_saved_progress(part: int):
    p = progress_file_path(part)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def save_progress(part: int, intro_sent: bool, last_completed):
    p = progress_file_path(part)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"introSent": intro_sent, "lastCompleted": last_completed}))
    tmp.replace(p)


def clear_progress(part: int):
    progress_file_path(part).unlink(missing_ok=True)


def make_progress_bar(label: str, bar_len: int = 30):
    """Returns a Telethon progress_callback(current, total) that redraws an
    inline progress bar in place, throttled so it doesn't spam the
    terminal on every chunk."""
    state = {"last_print": 0.0, "start": time.time()}

    def callback(current, total):
        now = time.time()
        if current < total and now - state["last_print"] < 0.2:
            return
        state["last_print"] = now
        pct = (current / total) if total else 0
        filled = int(bar_len * pct)
        bar = "█" * filled + "░" * (bar_len - filled)
        elapsed = now - state["start"]
        speed = (current / elapsed / (1024 * 1024)) if elapsed > 0 else 0
        mb_current = current / (1024 * 1024)
        mb_total = total / (1024 * 1024)
        end = "\n" if current >= total else ""
        print(
            f"\r  {label} [{bar}] {pct * 100:5.1f}%  {mb_current:7.1f}/{mb_total:7.1f} MB  {speed:5.1f} MB/s",
            end=end,
            flush=True,
        )

    return callback


async def with_flood_retry(coro_fn, label):
    from telethon.errors import FloodWaitError

    for attempt in range(1, 4):
        try:
            return await coro_fn()
        except FloodWaitError as err:
            print(f"  flood wait on {label}: sleeping {err.seconds}s (attempt {attempt}/3)")
            time.sleep(err.seconds + 1)
    return await coro_fn()


async def send_primary(client, channel, lesson: Lesson, section: Section):
    from telethon.tl.types import DocumentAttributeVideo

    caption = build_primary_caption(lesson, section)
    if lesson.is_video:
        duration, width, height = read_mp4_meta(lesson.primary.path)
        attributes = [DocumentAttributeVideo(duration=duration, w=width, h=height, supports_streaming=True)]
        return await with_flood_retry(
            lambda: client.send_file(
                channel,
                str(lesson.primary.path),
                caption=caption,
                attributes=attributes,
                supports_streaming=True,
                progress_callback=make_progress_bar(lesson.primary.path.name),
            ),
            lesson.primary.path.name,
        )
    return await with_flood_retry(
        lambda: client.send_file(channel, str(lesson.primary.path), caption=caption),
        lesson.primary.path.name,
    )


async def send_resources(client, channel, lesson: Lesson, section: Section):
    if not lesson.resources:
        return
    if len(lesson.resources) == 1:
        r = lesson.resources[0]
        await with_flood_retry(
            lambda: client.send_file(channel, str(r.path), caption=build_resource_caption(r, lesson, section)),
            r.path.name,
        )
        return
    files = [str(r.path) for r in lesson.resources]
    captions = [build_resource_caption(r, lesson, section) for r in lesson.resources]
    await with_flood_retry(
        lambda: client.send_file(channel, files, caption=captions),
        f"{len(lesson.resources)} resources for lesson {lesson.num}",
    )


async def run(args):
    sections = scan_course(Path(args.dir))
    total_lessons = sum(len(s.lessons) for s in sections)
    total_videos = sum(video_count(s) for s in sections)
    print(f'Found {len(sections)} sections, {total_lessons} lessons ({total_videos} videos) in "{args.dir}"')

    if args.dry_run:
        dry_run(sections, args.part, args.subtitle)
        return

    session = os.environ.get("TG_SESSION")
    if not session:
        raise RuntimeError('TG_SESSION is not set. Run "npm run login" (or a Telethon login) first.')

    from telethon import TelegramClient
    from telethon.sessions import StringSession

    api_id = int(os.environ["TG_API_ID"])
    api_hash = os.environ["TG_API_HASH"]
    channel_username = os.environ.get("TG_CHANNEL", "sm1523")

    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()
    channel = await client.get_entity(channel_username)

    manual_resume = args.from_section > 1 or args.from_lesson > 1
    if args.restart:
        clear_progress(args.part)

    if manual_resume:
        from_section, from_lesson, intro_sent = args.from_section, args.from_lesson, True
    else:
        saved = None if args.restart else load_saved_progress(args.part)
        if saved is None:
            from_section, from_lesson, intro_sent = 1, 1, False
        else:
            intro_sent = saved.get("introSent", False)
            last = saved.get("lastCompleted")
            if last is None:
                from_section, from_lesson = 1, 1
            else:
                from_section, from_lesson = last["section"], last["lesson"] + 1
                if from_lesson > len(sections[from_section - 1].lessons):
                    from_section, from_lesson = from_section + 1, 1
            if from_section > len(sections):
                print(f"upload_progress_part{args.part}.json says this part is already fully uploaded.")
                print("Delete that file (or pass --restart) if you want to re-send it anyway.")
                await client.disconnect()
                return
            print(f"Resuming from saved progress: section {from_section}, lesson {from_lesson}")

    if not intro_sent:
        print("Sending part intro message...")
        await with_flood_retry(
            lambda: client.send_message(channel, build_intro_caption(sections, args.part, args.subtitle)),
            "part intro",
        )
        save_progress(args.part, intro_sent=True, last_completed=None)
        time.sleep(args.delay_ms / 1000)

    for s_idx, section in enumerate(sections):
        section_num = s_idx + 1
        if section_num < from_section:
            continue
        first_lesson_to_send = from_lesson if section_num == from_section else 1

        if first_lesson_to_send == 1:
            print(f"Section {section.num_str}: sending header...")
            await with_flood_retry(
                lambda: client.send_message(channel, build_section_caption(section, args.part, args.subtitle)),
                f"section {section.num_str} header",
            )
            time.sleep(args.delay_ms / 1000)

        for l_idx, lesson in enumerate(section.lessons):
            lesson_num = l_idx + 1
            if lesson_num < first_lesson_to_send:
                continue
            print(f"Section {section.num_str}, lesson {lesson_num}/{len(section.lessons)}: {lesson.primary.title}")
            await send_primary(client, channel, lesson, section)
            time.sleep(args.delay_ms / 1000)
            await send_resources(client, channel, lesson, section)
            time.sleep(args.delay_ms / 1000)
            save_progress(args.part, intro_sent=True, last_completed={"section": section_num, "lesson": lesson_num})

    clear_progress(args.part)
    print("\nDone. Now run `npm run sync` locally to pull the new messages into data/content.json,")
    print("then commit and push data/content.json (data/sections.json already has this part's counts).")
    await client.disconnect()


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", required=True, help="Course folder")
    p.add_argument("--part", type=int, required=True, help="Part number, e.g. 4")
    p.add_argument("--subtitle", required=True, help='Subtitle, e.g. "OOP"')
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--from-section", type=int, default=1)
    p.add_argument("--from-lesson", type=int, default=1)
    p.add_argument("--restart", action="store_true")
    p.add_argument("--delay-ms", type=int, default=2000)
    return p.parse_args()


def main():
    load_dotenv(Path(__file__).with_name(".env"))
    args = parse_args()
    import asyncio

    asyncio.run(run(args))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)
