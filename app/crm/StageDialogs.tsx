"use client";

import { useId, useState } from "react";
import { LOST_REASONS, MAX_LOST_NOTE, parseLostReason } from "@/lib/crm/board";
import { money } from "@/lib/crm/view";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";

/**
 * The two questions a stage change can ask — shared by the board, the
 * Pipeline table's stage dropdown and its bulk "Move stage".
 *
 * They were written for the board first (lib/crm/board.ts has the rules):
 * Funded asks for confirmation, because it moves the month's numbers on the
 * dashboard and a mis-drop there is the one that would be reported as revenue;
 * Closed – Lost asks WHY, because a lost deal with no reason teaches nothing.
 * One copy of each now, so the table and the board cannot drift apart.
 *
 * These only ask. The caller does the move, through the same `setStage` /
 * `markLost` server actions, with its own route.
 */

export function ConfirmFundedDialog({
  open, names, amount, note, onCancel, onConfirm,
}: {
  open: boolean;
  /** The deals being marked. One name is spelled out; more are counted. */
  names: string[];
  /** Total requested, if known. */
  amount?: number;
  /** One more sentence about what happens next ("…and the deal leaves the board."). */
  note?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const many = names.length > 1;
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={many ? `Mark ${names.length} deals as funded?` : `Mark ${names[0] ?? "this deal"} as funded?`}
      footer={
        <>
          {/* Cancel has focus: a mis-click followed by a reflex Enter must not book revenue. */}
          <Button variant="secondary" data-autofocus onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>{many ? `Mark ${names.length} funded` : "Mark funded"}</Button>
        </>
      }
    >
      <p className="mt-2 text-sm text-slate-600">
        {amount && amount > 0 ? `${money(amount)} requested${many ? " between them" : ""}. ` : ""}
        {many ? "Each one counts" : "This counts"} toward Funded on the dashboard from today{note ? `, ${note}` : "."}
      </p>
      {many && (
        <p className="mt-2 max-h-28 overflow-y-auto text-xs text-slate-600">{names.join(" · ")}</p>
      )}
    </Dialog>
  );
}

export function LostReasonDialog({
  open, names, onCancel, onConfirm,
}: {
  open: boolean;
  names: string[];
  onCancel: () => void;
  onConfirm: (choice: string, note: string) => void;
}) {
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const ids = useId();
  const needsNote = choice === "Other";
  // The same parser the server runs, so the button is only enabled for an
  // answer the server will accept.
  const ready = parseLostReason(choice, note).ok;
  const many = names.length > 1;

  function reset() { setChoice(""); setNote(""); }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onCancel(); }}
      title={many ? `Why were these ${names.length} deals lost?` : `Why was ${names[0] ?? "this deal"} lost?`}
      description={
        many
          ? "The same reason is saved on each deal and in its history, so the reasons can be counted later."
          : "It's saved on the deal and in its history, so the reasons can be counted later."
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onCancel(); }}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!ready}
            onClick={() => { const c = choice, n = note; reset(); onConfirm(c, n); }}
          >
            {many ? `Close ${names.length} as lost` : "Close as lost"}
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-3">
        <div>
          <Label htmlFor={`${ids}-r`}>Reason</Label>
          <Select id={`${ids}-r`} value={choice} onChange={(e) => setChoice(e.target.value)} wrapperClassName="mt-1">
            <option value="" disabled>Pick one…</option>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${ids}-n`}>Detail {needsNote ? "(required)" : "(optional)"}</Label>
          <Textarea
            id={`${ids}-n`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_LOST_NOTE}
            rows={3}
            placeholder={needsNote ? "What happened?" : "e.g. which lender, what rate"}
            className="mt-1"
          />
        </div>
        {many && <p className="max-h-24 overflow-y-auto text-xs text-slate-600">{names.join(" · ")}</p>}
      </div>
    </Dialog>
  );
}
