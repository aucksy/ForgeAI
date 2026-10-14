/**
 * Add / edit a member.
 *
 * Only name and mobile are required. A front desk signing someone up during the
 * 7am rush should not be blocked on an email address nobody has — every other
 * field can be filled in later from the member's page.
 *
 * Two things this form must NOT do, both found by review:
 *  - It must not change lifecycle state. Validation used to hand back
 *    `archived: false` on every save, so opening an archived member to fix a typo
 *    quietly put them back on the roster and into every count.
 *  - It must not dead-end a non-Indian number. The dial code is a real control,
 *    because a stored `+971` member previously reloaded as `+91` and could not be
 *    saved again without retyping the number as Indian.
 */

import { useMemo, useState } from 'react';

import { useCrm } from '../../store';
import { tr } from '../../i18n';
import type { Member } from '../../types';
import {
  DIAL_CODES,
  emptyMemberForm,
  memberToForm,
  splitE164,
  validateMember,
  type MemberField,
  type MemberFormDraft,
} from '../../logic/members';
import { batchKey, BATCH_MAX, listBatches, resolveBatch, type BatchCount } from '../../logic/batches';
import { DuplicatePhoneError } from '../../data/adapter';
import { Button, ChipToggle, ErrorBanner, Grid, Row, SelectField, Sheet, TextField, color, font, space } from '../kit';
import { navigate } from '../router';

export function MemberFormSheet({
  editing,
  initial,
  onClose,
  onSaved,
}: {
  editing?: Member;
  /** A new member's name and E.164 mobile, filled in already (an enquiry being converted). */
  initial?: { fullName?: string; phone?: string };
  onClose: () => void;
  onSaved?: (member: Member) => void;
}) {
  const { today, memberViews, createMember, updateMember, setMemberArchived } = useCrm();
  // The batches this gym already uses, most used first: the usual pick is one tap.
  const batches = useMemo(() => listBatches(memberViews.map((v) => v.member)), [memberViews]);
  const [form, setForm] = useState<MemberFormDraft>(() => {
    if (editing) return memberToForm(editing);
    const blank = emptyMemberForm(today);
    if (!initial) return blank;
    const phone = initial.phone ? splitE164(initial.phone) : null;
    return {
      ...blank,
      fullName: initial.fullName ?? '',
      dialCode: phone?.dialCode ?? blank.dialCode,
      phone: phone?.national ?? '',
    };
  });
  const [fieldError, setFieldError] = useState<{ field: MemberField; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [archivedClash, setArchivedClash] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof MemberFormDraft) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldError(null);
    setFormError(null);
    setArchivedClash(null);
  };

  const errorFor = (field: MemberField) => (fieldError?.field === field ? fieldError.message : null);

  // The dial code stored on an existing member may not be in our shortlist.
  const dialOptions = [...new Set<string>([...DIAL_CODES, form.dialCode])].map((c) => ({
    value: c,
    label: c,
  }));

  const save = async () => {
    // "morning 6-8" typed as new joins the gym's existing "Morning 6-8", never a second chip.
    const typed = { ...form, batch: resolveBatch(form.batch, batches.map((b) => b.name)) ?? '' };
    const result = validateMember(typed, today);
    if (!result.ok) {
      setFieldError({ field: result.field, message: result.message });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      // Note what is NOT passed on edit: `archived` and `photoUri` are lifecycle
      // state, changed by their own actions, never as a side effect of a save.
      const saved = editing
        ? await updateMember(editing.id, result.value)
        : await createMember({ ...result.value, archived: false, photoUri: null });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      if (e instanceof DuplicatePhoneError) {
        if (e.existing.archived) {
          // Otherwise this is an unresolvable dead end: the clashing member is
          // archived, so they are not in the roster, not in any filter and not
          // findable by search — the owner is told the number is taken by
          // someone who appears not to exist.
          setArchivedClash(e.existing);
        } else {
          setFieldError({
            field: 'phone',
            message: tr(
              `${e.existing.fullName} is already on the roster with this number.`,
              `${e.existing.fullName} is number se pehle se member hai.`,
            ),
          });
        }
      } else {
        setFormError(e instanceof Error ? e.message : tr('Could not save this member.', 'Member save nahi hua.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const restoreArchived = async () => {
    if (!archivedClash) return;
    setSaving(true);
    try {
      await setMemberArchived(archivedClash.id, false);
      // The restored member IS the one being saved (an enquiry being converted links to them).
      onSaved?.({ ...archivedClash, archived: false });
      onClose();
      navigate(`/members/${archivedClash.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr('Could not restore that member.', 'Member wapas nahi aaya.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? tr('Edit member', 'Member badlo') : tr('Add member', 'Naya member jodo')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving
              ? tr('Saving…', 'Save ho raha hai…')
              : editing
                ? tr('Save changes', 'Save karo')
                : tr('Add member', 'Naya member jodo')}
          </Button>
        </>
      }
    >
      {formError && <ErrorBanner>{formError}</ErrorBanner>}

      {archivedClash && (
        <ErrorBanner>
          <div style={{ marginBottom: space.sm }}>
            <strong>{archivedClash.fullName}</strong>
            {tr(
              ' already has this number, but they were archived — that’s why you can’t see them in the list.',
              ' ke paas yeh number hai, par woh archive mein hain — isliye list mein nahi dikh rahe.',
            )}
          </div>
          <Row gap={space.sm}>
            <Button onClick={restoreArchived} disabled={saving}>
              {tr('Bring them back', 'Wapas lao')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                navigate(`/members/${archivedClash.id}`);
              }}
            >
              {tr('Open their record', 'Unka record kholo')}
            </Button>
          </Row>
        </ErrorBanner>
      )}

      <TextField
        label={tr('Full name', 'Poora naam')}
        value={form.fullName}
        onChange={set('fullName')}
        error={errorFor('fullName')}
        autoFocus={!editing}
        placeholder="Riya Sharma"
      />

      <Row gap={space.sm} align="flex-start">
        <div style={{ width: 110 }}>
          <SelectField label={tr('Code', 'Code')} value={form.dialCode} onChange={set('dialCode')} options={dialOptions} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField
            label={tr('Mobile number', 'Mobile number')}
            value={form.phone}
            onChange={set('phone')}
            error={errorFor('phone')}
            inputMode="tel"
            placeholder="98765 43210"
            hint={tr("How you'll find them, and how WhatsApp reaches them.", 'Isi se member milega, aur WhatsApp bhi isi par jayega.')}
          />
        </div>
      </Row>

      <BatchField
        value={form.batch}
        onChange={set('batch')}
        batches={batches}
        error={errorFor('batch')}
      />

      <Grid min={220}>
        <TextField
          label={tr('Joining date', 'Joining date')}
          value={form.joinedOn}
          onChange={set('joinedOn')}
          type="date"
          error={errorFor('joinedOn')}
        />
        <SelectField
          label={tr('Gender (optional)', 'Gender (zaroori nahi)')}
          value={form.gender}
          onChange={set('gender')}
          options={[
            { value: '', label: tr('Not stated', 'Nahi bataya') },
            { value: 'male', label: tr('Male', 'Male') },
            { value: 'female', label: tr('Female', 'Female') },
            { value: 'other', label: tr('Other', 'Anya') },
          ]}
        />
      </Grid>

      <Grid min={220}>
        <TextField
          label={tr('Date of birth (optional)', 'Janam din (zaroori nahi)')}
          value={form.dateOfBirth}
          onChange={set('dateOfBirth')}
          type="date"
          error={errorFor('dateOfBirth')}
        />
        <TextField
          label={tr('Email (optional)', 'Email (zaroori nahi)')}
          value={form.email}
          onChange={set('email')}
          type="email"
          inputMode="email"
          error={errorFor('email')}
        />
      </Grid>

      <TextField label={tr('Address (optional)', 'Pata (zaroori nahi)')} value={form.address} onChange={set('address')} />

      <Grid min={220}>
        <TextField
          label={tr('Emergency contact (optional)', 'Ghar wale ka naam (zaroori nahi)')}
          value={form.emergencyName}
          onChange={set('emergencyName')}
        />
        <TextField
          label={tr('Emergency number (optional)', 'Ghar ka number (zaroori nahi)')}
          value={form.emergencyPhone}
          onChange={set('emergencyPhone')}
          inputMode="tel"
          error={errorFor('emergencyPhone')}
        />
      </Grid>

      <TextField
        label={tr('Notes (optional)', 'Notes (zaroori nahi)')}
        value={form.notes}
        onChange={set('notes')}
        multiline
        placeholder={tr('Injuries, preferences, who referred them…', 'Chot, pasand, kisne bheja…')}
      />

      {editing?.archived && (
        <p style={{ margin: `${space.lg}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {tr(
            'This member is archived. Saving here won’t change that — use “Restore member” on their page.',
            'Yeh member archive mein hai. Yahan Save karne se yeh nahi badlega — unke page par “Member wapas lao” dabao.',
          )}
        </p>
      )}
    </Sheet>
  );
}

const NEW_BATCH = ' new';
const NONE = ' none';

/**
 * The member's batch: chips of the batches already in use (most used first), "None", and
 * "+ New batch" which opens a text box. A gym with no batches yet gets the text box alone. On a
 * phone the chips are one row that scrolls sideways, so the form grows by one line, not a grid.
 */
function BatchField({
  value,
  onChange,
  batches,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  batches: BatchCount[];
  error: string | null;
}) {
  const key = batchKey(value);
  // Typing a new name: held as its own mode so the text box stays open while the name is blank.
  const [typing, setTyping] = useState(() => key !== null && !batches.some((b) => b.key === key));

  if (batches.length === 0) {
    return (
      <TextField
        label={tr('Batch (optional)', 'Batch (zaroori nahi)')}
        value={value}
        onChange={onChange}
        error={error}
        placeholder={tr('Morning 6-8', 'Subah 6-8')}
        hint={tr('The time they train. Later members pick it with one tap.', 'Kis time aate hain. Agle members ek tap mein chun lenge.')}
      />
    );
  }

  const picked = typing ? NEW_BATCH : key ?? NONE;
  return (
    // `width: 0` + `minWidth: 100%`: the one-line chip row must not count toward the sheet's own
    // width. The sheet sizes itself to its content on a phone, so a row of five chips made the
    // whole form 570px wide on a 375px screen; this way the row fills the form and scrolls.
    <div style={{ marginTop: space.md, width: 0, minWidth: '100%' }}>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {tr('Batch (optional)', 'Batch (zaroori nahi)')}
      </div>
      <ChipToggle
        label={tr('Batch', 'Batch')}
        value={picked}
        onChange={(v) => {
          if (v === NEW_BATCH) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(v === NONE ? '' : (batches.find((b) => b.key === v)?.name ?? ''));
          }
        }}
        options={[
          ...batches.map((b) => ({ value: b.key, label: b.name, count: b.countN })),
          { value: NONE, label: tr('None', 'Koi nahi') },
          { value: NEW_BATCH, label: tr('+ New batch', '+ Naya Batch') },
        ]}
      />
      {typing ? (
        <TextField
          label={tr('New batch name', 'Naye Batch ka naam')}
          value={value}
          onChange={onChange}
          error={error}
          autoFocus
          placeholder={tr('Evening 6-9', 'Shaam 6-9')}
          hint={tr(`Up to ${BATCH_MAX} letters.`, `${BATCH_MAX} akshar tak.`)}
        />
      ) : (
        error && (
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.criticalText, marginTop: 5 }}>{error}</div>
        )
      )}
    </div>
  );
}
