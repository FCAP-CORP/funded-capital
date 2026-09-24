#!/usr/bin/env node
/**
 * Pull finished blog drafts from the website into content/blog.
 *
 * Run by fc-pull-drafts.bat from the repository root. Everything it does is in
 * pull-drafts.lib.mjs, where it is tested; this file only hands it the real
 * world — this folder, the network and the console.
 *
 * Needs Node 20 or newer (built-in fetch).
 */

import { pullDrafts } from "./pull-drafts.lib.mjs";

const code = await pullDrafts({ root: process.cwd(), env: process.env });
process.exit(code);
