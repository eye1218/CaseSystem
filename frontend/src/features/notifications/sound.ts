import type { NotificationSummary } from "../../types/notification";

export const NOTIFICATION_SOUND_ENABLED_STORAGE_KEY = "notification-sound-enabled-v1";
const SOUND_THROTTLE_MS = 2_000;

export type SoundKey =
  | "important_message"
  | "sla_critical"
  | "ticket_new_p1"
  | "ticket_new_p2"
  | "ticket_new_p3"
  | "ticket_new_p4";

const SOUND_PATH_MAP: Record<SoundKey, string> = {
  important_message: "/sounds/important_message.mp3",
  sla_critical: "/sounds/sla_critical.mp3",
  ticket_new_p1: "/sounds/ticket_new_p1.mp3",
  ticket_new_p2: "/sounds/ticket_new_p2.mp3",
  ticket_new_p3: "/sounds/ticket_new_p3.mp3",
  ticket_new_p4: "/sounds/ticket_new_p4.mp3",
};

const CATEGORY_SOUND_MAP: Record<string, SoundKey> = {
  ticket_assigned: "ticket_new_p2",
  ticket_escalation_accepted: "ticket_new_p3",
  ticket_escalation_rejected: "ticket_new_p2",
};

function ensureAudio(path: string): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return null;
  }
  const audio = new Audio(path);
  audio.preload = "auto";
  return audio;
}

class NotificationSoundPlayer {
  private interacted = false;
  private bootstrapped = false;
  private lastPlayedAt = 0;
  private cache = new Map<SoundKey, HTMLAudioElement>();

  private markInteracted = () => {
    this.interacted = true;
    this.unbindInteractionListeners();
  };

  private bootstrap() {
    if (this.bootstrapped || typeof window === "undefined") {
      return;
    }
    this.bootstrapped = true;
    window.addEventListener("pointerdown", this.markInteracted, { once: true, capture: true });
    window.addEventListener("keydown", this.markInteracted, { once: true, capture: true });
    window.addEventListener("touchstart", this.markInteracted, { once: true, capture: true });
  }

  private unbindInteractionListeners() {
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener("pointerdown", this.markInteracted, true);
    window.removeEventListener("keydown", this.markInteracted, true);
    window.removeEventListener("touchstart", this.markInteracted, true);
  }

  async play(soundKey: SoundKey) {
    this.bootstrap();
    if (!this.interacted) {
      return;
    }
    const now = Date.now();
    if (now - this.lastPlayedAt < SOUND_THROTTLE_MS) {
      return;
    }
    const path = SOUND_PATH_MAP[soundKey];
    let audio = this.cache.get(soundKey);
    if (!audio) {
      audio = ensureAudio(path);
      if (!audio) {
        return;
      }
      this.cache.set(soundKey, audio);
    }
    try {
      audio.currentTime = 0;
      await audio.play();
      this.lastPlayedAt = now;
    } catch {
      // Ignore autoplay failures and keep UI flow stable.
    }
  }
}

const notificationSoundPlayer = new NotificationSoundPlayer();

export function loadSoundEnabledSetting(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    return raw !== "0";
  } catch {
    return true;
  }
}

export function persistSoundEnabledSetting(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      NOTIFICATION_SOUND_ENABLED_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // Ignore storage failures to avoid breaking notification flow.
  }
}

export function resolveNotificationSoundKey(notification: Pick<NotificationSummary, "action_required" | "category">): SoundKey {
  if (notification.action_required) {
    return "important_message";
  }
  return CATEGORY_SOUND_MAP[notification.category] ?? "ticket_new_p3";
}

export async function playNotificationCreatedSound(
  notification: Pick<NotificationSummary, "action_required" | "category">,
) {
  const soundKey = resolveNotificationSoundKey(notification);
  await notificationSoundPlayer.play(soundKey);
}

export async function playTimeoutReminderSound() {
  await notificationSoundPlayer.play("sla_critical");
}

