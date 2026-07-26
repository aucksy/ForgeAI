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
            message: `${e.existing.fullName} is already on the roster with this number.`,
          });
        }
      } else {
        setFormError(e instanceof Error ? e.message : 'Could not save this member.');
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
      setFormError(e instanceof Error ? e.message : 'Could not restore that member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? 'Edit member' : 'Add member'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add member'}
          </Button>
        </>
      }
    >
      {formError && <ErrorBanner>{formError}</ErrorBanner>}

      {archivedClash && (
        <ErrorBanner>
          <div style={{ marginBottom: space.sm }}>
            <strong>{archivedClash.fullName}</strong> already has this number, but they were archived
            — that’s why you can’t see them in the list.
          </div>
          <Row gap={space.sm}>
            <Button onClick={restoreArchived} disabled={saving}>
              Bring them back
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                navigate(`/members/${archivedClash.id}`);
              }}
            >
              Open their record
            </Button>
          </Row>
        </ErrorBanner>
      )}

      <TextField
        label="Full name"
        value={form.fullName}
        onChange={set('fullName')}
        error={errorFor('fullName')}
        autoFocus={!editing}
        placeholder="Riya Sharma"
      />

      <Row gap={space.sm} align="flex-start">
        <div style={{ width: 110 }}>
          <SelectField label="Code" value={form.dialCode} onChange={set('dialCode')} options={dialOptions} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField
            label="Mobile number"
            value={form.phone}
            onChange={set('phone')}
            error={errorFor('phone')}
            inputMode="tel"
            placeholder="98765 43210"
            hint="How you'll find them, and how WhatsApp reaches them."
          />
        </div>
      </Row>

      <Grid min={220}>
        <TextField
          label="Joining date"
          value={form.joinedOn}
          onChange={set('joinedOn')}
          type="date"
          error={errorFor('joinedOn')}
        />
        <SelectField
          label="Gender (optional)"
          value={form.gender}
          onChange={set('gender')}
          options={[
            { value: '', label: 'Not stated' },
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </Grid>

      <Grid min={220}>
        <TextField
          label="Date of birth (optional)"
          value={form.dateOfBirth}
          onChange={set('dateOfBirth')}
          type="date"
          error={errorFor('dateOfBirth')}
        />
        <TextField
          label="Email (optional)"
          value={form.email}
          onChange={set('email')}
          type="email"
          inputMode="email"
          error={errorFor('email')}
        />
      </Grid>

      <TextField label="Address (optional)" value={form.address} onChange={set('address')} />

      <Grid min={220}>
        <TextField
          label="Emergency contact (optional)"
          value={form.emergencyName}
          onChange={set('emergencyName')}
        />
        <TextField
          label="Emergency number (optional)"
          value={form.emergencyPhone}
          onChange={set('emergencyPhone')}
          inputMode="tel"
          error={errorFor('emergencyPhone')}
        />
      </Grid>

      <TextField
        label="Notes (optional)"
        value={form.notes}
        onChange={set('notes')}
        multiline
        placeholder="Injuries, preferences, who referred them…"
      />

      {editing?.archived && (
        <p style={{ margin: `${space.lg}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          This member is archived. Saving here won’t change that — use “Restore member” on their page.
        </p>
      )}
    </Sheet>
  );
}
