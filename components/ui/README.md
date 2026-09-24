# components/ui — the Funded Capital component kit

Copy-in components in the shadcn/ui style: the code lives here, in the repo, themed to the
brand tokens in `tailwind.config.ts` (navy, gold, slate). There is no runtime dependency on
"shadcn" — only `clsx` + `tailwind-merge` behind `cn()` in `lib/utils.ts`.

**Rules the kit keeps, so pages don't have to remember them**

- **Server-safe by default.** Only `dialog`, `dropdown-menu`, `tabs` and `toast` are
  `"use client"` — they hold state. Everything else ships zero JavaScript.
  `lib/crm/guards.ui.regress.ts` §6 fails the build if that changes.
- **Focus rings are gold-700 on light, gold-400 on navy** (`focus.ts`). gold-500 on white is
  2.3:1 and fails WCAG's 3:1 for focus indicators.
- **No gold text on white at small sizes** — gold-700 is 4.1:1, under the 4.5:1 body-text bar.
  Links are navy with a gold underline; the gold badge is navy text on a pale gold fill.
- **Motion respects `prefers-reduced-motion`** (spinners, skeleton pulse, dialog/toast fades).
- **`cn()` costs ~7 KB gzipped in the browser** (tailwind-merge). In a server component it
  costs nothing. In code that loads on every page (the shell) use plain `clsx`.

| Component | File | Client? | Use it for |
|---|---|---|---|
| `Button`, `buttonVariants()` | `button.tsx` | no | Every button. `buttonVariants()` styles a `<Link>` as a button |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `cardClass` | `card.tsx` | no | Every white panel |
| `Badge`, `StageBadge` | `badge.tsx` | no | Status words. `StageBadge` reads tones from `lib/crm/view.ts` |
| `Tabs` | `tabs.tsx` | yes | Switching between server-rendered panels |
| `Label`, `Input`, `Textarea`, `Select`, `Checkbox` | `field.tsx` | no | Form controls (native elements, styled) |
| `Dialog` | `dialog.tsx` | yes | Modals: confirmations, short forms, the ⌘K palette |
| `DropdownMenu` + `Item`, `CheckboxItem`, `Label`, `Separator` | `dropdown-menu.tsx` | yes | Small menus (Views, Columns, More) |
| `Tooltip` | `tooltip.tsx` | no | A hint on hover/focus — supplementary only |
| `EmptyState` | `empty-state.tsx` | no | What an empty list says: why, and what next |
| `Skeleton` | `skeleton.tsx` | no | Loading shapes inside `<Suspense>` fallbacks |
| `StatCard` | `stat-card.tsx` | no | One KPI (the dashboard's card; the Pipeline strip uses it too) |
| `PageHeader` | `page-header.tsx` | no | Every page's title, one-line purpose, and actions |
| `Toaster`, `toast` | `toast.tsx` | yes | One line of feedback after an action (mounted once in the shell) |

## Button

```tsx
import { Button, buttonVariants } from "@/components/ui/button";

<Button onClick={save} loading={pending}>Save</Button>                 // primary = navy
<Button variant="accent">Open Marcus</Button>                           // gold: THE action on the screen
<Button variant="secondary" size="sm">Export CSV</Button>
<Button variant="ghost" size="xs">Cancel request</Button>
<Button variant="danger">Close as lost</Button>
<Button variant="secondary" size="icon-sm" aria-label="Next page"><ChevronRight aria-hidden /></Button>
<Link href="/broker-portal/apply" className={buttonVariants({ size: "lg" })}>New application</Link>
```

Sizes: `xs` (32px), `sm` (36px), `md` (40px, default), `lg` (44px), `icon`, `icon-sm`.
An icon-only button **must** have `aria-label`. There is no `asChild`: a function returning a
class string keeps a link a real link and needs no `@radix-ui/react-slot`.

## Card

```tsx
<Card as="section" aria-labelledby="inv-h">
  <CardHeader><CardTitle id="inv-h">Invitations</CardTitle><CardDescription>3 pending</CardDescription></CardHeader>
  <CardContent>…</CardContent>
</Card>
<Card className="overflow-x-auto"><table>…</table></Card>   // a table in a card
```

## Badge

```tsx
<Badge tone="success">Published</Badge>      // neutral · navy · gold · info · success · warning · danger · muted
<StageBadge stage={row.stage} />             // tone from STAGE_TONE in lib/crm/view.ts (tested)
```

## Form controls

```tsx
<Label htmlFor="topic">Topic</Label>
<Input id="topic" placeholder="A sentence, not a keyword." />
<Select aria-label="Firm" value={firmId} onChange={…}><option value="">Unassigned</option>…</Select>
<Textarea rows={3} aria-label="Notes" />
<Checkbox checked={on} onChange={…} aria-label="Select Marcus Rivera" />
```

Every control needs a label — a visible `<Label>` or an `aria-label`. A placeholder is not a
label. For a checkbox's "some selected" state set `el.indeterminate` from a ref.

## Dialog

```tsx
<Dialog
  open={open}
  onClose={() => setOpen(false)}
  title="Mark 3 deals as funded?"
  description="Each one counts toward Funded on the dashboard from today."
  footer={<>
    <Button variant="secondary" data-autofocus onClick={cancel}>Cancel</Button>
    <Button onClick={confirm}>Mark funded</Button>
  </>}
/>
```

Built on the native `<dialog>` + `showModal()`: real focus trap, Escape, top layer. Focus goes
to `[data-autofocus]` (put it on Cancel for anything consequential), else the first field;
it returns to the opener on close. Backdrop click closes. The funded / lost questions used by
the board and the Pipeline table live in `app/crm/StageDialogs.tsx`.

## DropdownMenu

```tsx
<DropdownMenu trigger={<><Columns3 size={14} aria-hidden /> Columns</>} label="Show or hide columns">
  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
  <DropdownMenuCheckboxItem checked={visible} onCheckedChange={setVisible}>Email</DropdownMenuCheckboxItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem onSelect={reset}>Default columns</DropdownMenuItem>
</DropdownMenu>
```

A native `<details>` (the dashboard's "More" menu pattern): opens with Enter/Space, closes on
Escape (focus back to the trigger), outside click, or choosing an item. Contents render only
while open.

## Tabs

```tsx
<Tabs label="Work queue by reason" items={[
  { key: "reply", label: "Awaiting reply", count: 4, content: <ReplyList /> },
  { key: "cold", label: "Term sheet cold", count: 2, content: <ColdList /> },
]} />
```

ARIA tabs with roving tabindex; Left/Right/Home/End. `variant="underline"` for page-level tabs.

## Tooltip

```tsx
<Tooltip content="Suspending cuts access immediately"><Button …>Suspend</Button></Tooltip>
```

CSS only (hover and keyboard focus). It is `aria-hidden` — anything a screen-reader user needs
belongs in the trigger's own label.

## EmptyState, Skeleton

```tsx
<EmptyState icon={Building2} title="No firms yet" description="Add the first one above." action={<Button>Add a firm</Button>} />
<Skeleton className="h-4 w-40" />
```

## StatCard, PageHeader

```tsx
<PageHeader title="Pipeline" description="Every application in one place." actions={<ViewToggle current="table" />} />
<StatCard title="Stalled 30d+" value="23" sub="no stage movement" tone="warn" />
```

A long value (more than 8 characters, e.g. `$16,938,140`) steps down one size so it never runs
out of a half-width card on a phone.

## Toast

```tsx
import { toast } from "@/components/ui/toast";
toast.success("Moved 6 deals to Underwriting");
toast.error("2 not moved", "Cal: application not found");
```

Our own ~1 KB store instead of `sonner` (~5 KB): a polite live region for confirmations,
`role="alert"` for errors (which stay 10 s), at most four on screen. `<Toaster />` is mounted
once in `components/workspace/WorkspaceShell.tsx`.
