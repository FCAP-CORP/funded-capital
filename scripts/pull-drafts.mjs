#!/usr/bin/env node
/**
 * Pull finished blog drafts from the website into content/blog.
 *
 * Run by fc-pull-drafts.bat from the repository root. Everything it does is in
 * pull-drafts.lib.mjs, where it is tested; this file only hands it the real
 * world — this folder, the network and the console.
 *
 * Needs Node 20 or newer (built-in fetch).
 *
 * WHY exitCode AND NOT process.exit() (25 Sep 2026). On Windows, calling
 * process.exit() while fetch's connection to the website is still closing
 * crashes Node inside libuv ("Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING), file src\win\async.c"). The drafts had already been
 * written, but the crash replaced the real exit code, so the .bat printed
 * "STOPPED - Nothing was changed" over a run that had succeeded. Setting
 * exitCode lets Node finish closing the connection and then exit with the
 * same code.
 */

import { pullDrafts } from "./pull-drafts.lib.mjs";

process.exitCode = await pullDrafts({ root: process.cwd(), env: process.env });
