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

import { useState } from 'react';

import { useCrm } from '../../store';
import { tr } from '../../i18n';
import type { Member } from '../../types';
import {
  DIAL_CODES,
  emptyMemberForm,
  memberToForm,
  validateMember,
  type MemberField,
  type MemberFormDraft,
} from '../../logic/members';
import { DuplicatePhoneError } from '../../data/adapter';
import { Button, ErrorBanner, Grid, Row, SelectField, Sheet, TextField, color, font, space } from '../kit';
import { navigate } from '../router';

export function MemberFormSheet({
  editing,
  onClose,
  onSaved,
}: {
  editing?: Member;
  onClose: () => void;
  onSaved?: (member: Member) => void;
}) {
  const { today, createMember, updateMember, setMemberArchived } = useCrm();
  const [form, setForm] = useState<MemberFormDraft>(() =>
    editing ? memberToForm(editing) : emptyMemberForm(today),
  );
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
    const result = validateMember(form, today);
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
