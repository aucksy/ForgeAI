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

import { useEffect, useMemo, useState } from 'react';

import { useCrm } from '../../store';
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
import { Button, CheckField, ChipToggle, ErrorBanner, Grid, Row, SelectField, Sheet, TextField, color, font, space } from '../kit';
import { useBranches } from '../../branches/context';
import { useCan } from '../../auth/AuthProvider';
import { navigate } from '../router';
import { DeskCameraSheet } from '../DeskCameraSheet';
import { useDeskPhotoKey } from '../MemberPhoto';
import { MemberPhotoError, saveMemberPhoto } from '../../shop/memberPhotoApi';
import { photoServerWords } from '../../logic/memberPhoto';
import { errorWords } from '../../shop/logic';

/** The photo row on "Add member" (F107). */
export const FORM_PHOTO_WORDS = {
  label: 'Photo (optional)', // member-words
  take: 'Take photo', // member-words
  change: 'Change photo', // member-words
  remove: 'Remove', // member-words
  hint: 'Helps the desk know who is who at check-in. Only your gym’s staff can see it.', // member-words
  done: 'Done', // member-words
  /** The member was added, but their photo did not save. */
  notSaved: (name: string, why: string) =>
    `${name} is added, but the photo didn’t save. ${why} You can add it later on their page with Take photo.`, // member-words
} as const;

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
  // #41: with 2 or more branches the owner says whether this member may train at every branch.
  const { multi } = useBranches();
  const allowed = useCan();
  const canSetBranches = multi && allowed('manageGym');
  const [allBranches, setAllBranches] = useState(editing?.allBranches === true);
  // F107: a photo taken at the desk, saved right after the new member is. Only on "Add member" and
  // only when this gym's server keeps photos (the key is null otherwise, and the row stays hidden).
  const photoKey = useDeskPhotoKey();
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [camera, setCamera] = useState(false);
  /** Added, but the photo did not save: the sheet stays open to say so, with one "Done" button. */
  const [addedNoPhoto, setAddedNoPhoto] = useState<Member | null>(null);
  useEffect(() => {
    if (!photo) return;
    const url = photo.url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

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
      const branchPart = canSetBranches ? { allBranches } : {};
      const saved = editing
        ? await updateMember(editing.id, { ...result.value, ...branchPart })
        : await createMember({ ...result.value, archived: false, photoUri: null, ...branchPart });
      if (!editing && photo && photoKey) {
        try {
          await saveMemberPhoto(photoKey, saved.id, photo.blob);
        } catch (e) {
          console.warn('[ForgeErr] add member: the member saved but the photo did not', e);
          const why = e instanceof MemberPhotoError ? e.message : (photoServerWords(e) ?? errorWords(e));
          setAddedNoPhoto(saved);
          setFormError(FORM_PHOTO_WORDS.notSaved(saved.fullName, why));
          return;
        }
      }
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
            message: `${e.existing.fullName} already has this mobile number in Members.`,
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
      // The restored member IS the one being saved (an enquiry being converted links to them).
      onSaved?.({ ...archivedClash, archived: false });
      onClose();
      navigate(`/members/${archivedClash.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not bring back that member. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Once the member is added (photo not saved), every way out hands the saved member on: an
  // enquiry being converted links to them through onSaved.
  const close = () => {
    if (addedNoPhoto) onSaved?.(addedNoPhoto);
    onClose();
  };

  // The camera takes the form's place while it is open (never a sheet on a sheet: Escape would close
  // both). Everything typed stays: it lives in this component, not in the sheet.
  if (camera) {
    return (
      <DeskCameraSheet
        title={photo ? FORM_PHOTO_WORDS.change : FORM_PHOTO_WORDS.take}
        onClose={() => setCamera(false)}
        onUse={(blob) => setPhoto({ blob, url: URL.createObjectURL(blob) })}
      />
    );
  }

  return (
    <Sheet
      title={editing ? 'Edit member' : 'Add member'}
      onClose={close}
      wide
      footer={
        addedNoPhoto ? (
          <Button onClick={close}>{FORM_PHOTO_WORDS.done}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : 'Add member'}
            </Button>
          </>
        )
      }
    >
      {formError && <ErrorBanner>{formError}</ErrorBanner>}

      {!editing && photoKey && !addedNoPhoto && (
        <div style={{ marginBottom: space.md }}>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>{FORM_PHOTO_WORDS.label}</div>
          <Row gap={space.md} wrap={false}>
            {photo ? (
              <img
                src={photo.url}
                alt=""
                width={56}
                height={56}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${color.border}`, flexShrink: 0 }}
              />
            ) : null}
            <Row gap={space.sm}>
              <Button variant="ghost" onClick={() => setCamera(true)} disabled={saving}>
                {photo ? FORM_PHOTO_WORDS.change : FORM_PHOTO_WORDS.take}
              </Button>
              {photo && (
                <Button variant="quiet" onClick={() => setPhoto(null)} disabled={saving}>
                  {FORM_PHOTO_WORDS.remove}
                </Button>
              )}
            </Row>
          </Row>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 5 }}>{FORM_PHOTO_WORDS.hint}</div>
        </div>
      )}


      {archivedClash && (
        <ErrorBanner>
          <div style={{ marginBottom: space.sm }}>
            <strong>{archivedClash.fullName}</strong>
            {' already has this number. They are archived, so they are hidden from the list.'}
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
              Open their page
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
            hint="Used to find them, and to send them WhatsApp messages."
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

      {canSetBranches && (
        <CheckField checked={allBranches} onChange={setAllBranches} hint="Any branch’s front desk can then check them in with their mobile number. With the MettleUp app, they can also scan the QR poster at any branch.">
          Can train at every branch
        </CheckField>
      )}

      {editing?.archived && (
        <p style={{ margin: `${space.lg}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          This member is archived. Saving here won’t change that. To bring them back, tap “Restore member” on their page.
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
        label="Batch (optional)"
        value={value}
        onChange={onChange}
        error={error}
        placeholder="Morning 6-8"
        hint="The time they train. Next time, you can pick it with one tap."
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
        Batch (optional)
      </div>
      <ChipToggle
        label="Batch"
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
          { value: NONE, label: 'None' },
          { value: NEW_BATCH, label: '+ New batch' },
        ]}
      />
      {typing ? (
        <TextField
          label="New batch name"
          value={value}
          onChange={onChange}
          error={error}
          autoFocus
          placeholder="Evening 6-9"
          hint={`Up to ${BATCH_MAX} letters.`}
        />
      ) : (
        error && (
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.criticalText, marginTop: 5 }}>{error}</div>
        )
      )}
    </div>
  );
}
