/**
 * F201: everything the assistant's answers and drafts read (answer.ts AnswerData, plan.ts PlanData), from the
 * panel's own store, plus the two lists only the server has: the gym's app members (who gets a message in the
 * app) and the messages sent so far (the daily and weekly limits). Those two load when the assistant opens.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCan, useRole } from '../../auth/AuthProvider';
import { appPhones } from '../../logic/audience';
import * as shopApi from '../../shop/api';
import type { AppMember } from '../../shop/logic';
import type { SentMessage } from '../../shop/messages';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { useMessageLang } from '../../ui/MessageLanguage';
import type { PlanData } from '../plan';

export interface AssistantData {
  data: PlanData;
  /** Load the app members and sent messages again (after a message is sent). */
  reload: () => Promise<void>;
}

export function useAssistantData(key: string | null): AssistantData {
  const { snapshot, memberViews, allMemberViews, today } = useCrm();
  const { now } = useShop();
  const role = useRole();
  const seeTotals = useCan()('seeTotals');
  const [gymLang] = useMessageLang();
  const [appMembers, setAppMembers] = useState<AppMember[] | null>(null);
  const [sent, setSent] = useState<SentMessage[] | null>(null);

  const reload = useCallback(async () => {
    if (!key) return;
    try {
      const [people, list] = await Promise.all([shopApi.listAppMembers(key), shopApi.listMessages(key)]);
      setAppMembers(people);
      setSent(list);
    } catch (e) {
      // Offline: answers still work; a message card says the app list could not load.
      console.warn('[assistant] the app members or sent messages could not load', e);
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const data = useMemo<PlanData>(
    () => ({
      snapshot,
      views: memberViews,
      allViews: allMemberViews,
      today,
      now,
      appPhones: appMembers ? appPhones(appMembers) : null,
      seeTotals,
      role,
      sent,
      appMembers,
      gymLang,
    }),
    [snapshot, memberViews, allMemberViews, today, now, appMembers, seeTotals, role, sent, gymLang],
  );
  return { data, reload };
}
