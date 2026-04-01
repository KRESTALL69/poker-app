export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
    [key: string]: unknown;
  };
  ready?: () => void;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function parseTelegramUserFromInitDataParam(rawValue: string): TelegramWebAppUser | null {
  try {
    const params = new URLSearchParams(rawValue);
    const userRaw = params.get("user");

    if (!userRaw) {
      return null;
    }

    return JSON.parse(userRaw) as TelegramWebAppUser;
  } catch (error) {
    console.error("Failed to parse tgWebAppData user:", error);
    return null;
  }
}

function getTelegramUserFromLaunchParams(): TelegramWebAppUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash
    );

    const searchInitData = searchParams.get("tgWebAppData");
    if (searchInitData) {
      const user = parseTelegramUserFromInitDataParam(searchInitData);
      if (user) {
        return user;
      }
    }

    const hashInitData = hashParams.get("tgWebAppData");
    if (hashInitData) {
      const user = parseTelegramUserFromInitDataParam(hashInitData);
      if (user) {
        return user;
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to read Telegram launch params:", error);
    return null;
  }
}

function hasTelegramLaunchParams(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash
    );

    return Boolean(
      searchParams.get("tgWebAppData") || hashParams.get("tgWebAppData")
    );
  } catch (error) {
    console.error("Failed to detect Telegram launch params:", error);
    return false;
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Telegram?.WebApp ?? null;
}

export function isTelegramMiniAppContext(): boolean {
  const webApp = getTelegramWebApp();

  if (webApp?.initData || webApp?.initDataUnsafe?.user) {
    return true;
  }

  return hasTelegramLaunchParams();
}

export function getTelegramUser(): TelegramWebAppUser | null {
  const webApp = getTelegramWebApp();

  if (webApp?.initDataUnsafe?.user) {
    return webApp.initDataUnsafe.user;
  }

  return getTelegramUserFromLaunchParams();
}
