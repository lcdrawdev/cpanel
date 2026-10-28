"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { ServiceError } from "@/server/services/errors";
import { changePassword } from "@/server/services/admins";
import { addDevice, removeDevice, renameDevice, setDeviceBlocked, setDevicePlaylists, setDeviceProfile } from "@/server/services/devices";
import { createCode, deleteCode, setCodeEnabled } from "@/server/services/codes";
import { createProfile, deleteProfile, updateProfileSettings } from "@/server/services/profiles";
import { connectDeviceXtream, createPlaylist, deletePlaylist, updatePlaylist, type PlaylistInput } from "@/server/services/playlists";
import { createGroup, deleteGroup, setDeviceGroup, updateGroup } from "@/server/services/groups";
import { updateMaintenance, updatePolicies } from "@/server/services/account-settings";
import { setReportStatus } from "@/server/services/reports";
import { addPredefinedPortal, removePredefinedPortal, setPortalMode, updateBranding } from "@/server/services/predefined-portal";
import { addFavorite, removeFavorite, setDeviceSync, setSyncPlaylists, updateSyncConfig } from "@/server/services/sync";
import { hideSportEntry, unhideSportEntry, updateSportsMode } from "@/server/services/sports";
import { updateSportsDataKeys } from "@/server/services/sports-data";
import { addArtwork, moveArtwork, removeArtwork } from "@/server/services/artwork";
import { clearDeviceOverrides, setDeviceOverrides } from "@/server/services/device-settings";
import { copyDevice, createSnapshot, deleteSnapshot, restoreSnapshot } from "@/server/services/snapshots";
import { createApiKey, revokeApiKey } from "@/server/services/integrations";
import { flushNotifications, updateNotificationPrefs } from "@/server/services/notifications";
import { settingsFromForm } from "@/shared/settings";
import { updateAppearance } from "@/server/services/app-appearance";
import { createMessage, deleteMessage } from "@/server/services/messages";
import type { ActionResult } from "@/components/forms";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Auth check + friendly error mapping shared by every admin action. */
async function run(fn: (actor: string) => Promise<string | void>): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const ok = await fn(admin.email);
    refresh();
    return { ok: ok || "Alterações salvas." };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
}

// ---------- Dispositivos ----------
export async function addDeviceAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await addDevice(await getDb(), actor, { deviceId: str(form, "deviceId"), nickname: str(form, "nickname") });
    return "Dispositivo cadastrado. Ele aparece como “Aguardando ativação” até o app se conectar.";
  });
}

export async function renameDeviceAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => renameDevice(await getDb(), actor, str(form, "id"), str(form, "nickname"), form.has("customerName") ? str(form, "customerName") : undefined));
}

export async function connectDeviceXtreamAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await connectDeviceXtream(await getDb(), actor, str(form, "id"), { url: str(form, "url"), username: str(form, "username"), password: String(form.get("password") ?? "") });
    return "Login aceito pelo servidor e enviado para a TV.";
  });
}

// ---------- Capas e logos ----------
export async function addArtworkAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    const kind = str(form, "kind") as "service" | "series" | "movies";
    const r = await addArtwork(await getDb(), actor, { kind, name: str(form, "name"), imageUrl: str(form, "imageUrl") });
    return r === "updated" ? "Link atualizado. As TVs recebem na hora." : "Imagem adicionada. As TVs recebem na hora.";
  });
}

export async function removeArtworkAction(form: FormData) {
  const admin = await requireAdmin();
  await removeArtwork(await getDb(), admin.email, str(form, "id"));
  refresh();
}

export async function moveArtworkAction(form: FormData) {
  const admin = await requireAdmin();
  await moveArtwork(await getDb(), admin.email, str(form, "id"), str(form, "dir") === "up" ? "up" : "down");
  refresh();
}

export async function saveSportsDataKeysAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateSportsDataKeys(await getDb(), actor, {
      sportsDbKey: str(form, "sportsDbKey"), removeSportsDbKey: form.has("removeSportsDbKey"),
      apiSportsKey: str(form, "apiSportsKey"), removeApiSportsKey: form.has("removeApiSportsKey"),
    });
    return "Chaves de dados esportivos salvas.";
  });
}

export async function setDeviceProfileAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => setDeviceProfile(await getDb(), actor, str(form, "id"), str(form, "profileId") || null));
}

export async function setDevicePlaylistsAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => setDevicePlaylists(await getDb(), actor, str(form, "id"), form.getAll("playlistIds").map(String)));
}

export async function setDeviceBlockedAction(_p: ActionResult, form: FormData) {
  const blocked = str(form, "blocked") === "true";
  return run(async (actor) => {
    await setDeviceBlocked(await getDb(), actor, str(form, "id"), blocked);
    return blocked ? "Dispositivo bloqueado e acesso revogado." : "Dispositivo desbloqueado.";
  });
}

export async function removeDeviceAction(form: FormData) {
  const admin = await requireAdmin();
  await removeDevice(await getDb(), admin.email, str(form, "id"));
  redirect("/dispositivos");
}

// ---------- Códigos ----------
export async function createCodeAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    const expires = str(form, "expiresAt");
    const code = await createCode(await getDb(), actor, {
      label: str(form, "label"),
      maxUses: Number(str(form, "maxUses")),
      profileId: str(form, "profileId") || null,
      playlistIds: form.getAll("playlistIds").map(String),
      groupId: str(form, "groupId") || null,
      expiresAt: expires ? new Date(`${expires}T23:59:59`) : null,
    });
    return `Código ${code.code} criado.`;
  });
}

export async function toggleCodeAction(form: FormData) {
  const admin = await requireAdmin();
  await setCodeEnabled(await getDb(), admin.email, str(form, "id"), str(form, "enabled") === "true");
  refresh();
}

export async function deleteCodeAction(form: FormData) {
  const admin = await requireAdmin();
  await deleteCode(await getDb(), admin.email, str(form, "id"));
  refresh();
}

// ---------- Perfis ----------
export async function createProfileAction(_p: ActionResult, form: FormData) {
  const admin = await requireAdmin();
  let id: string;
  try {
    const platform = str(form, "platform") as "tv" | "mobile" | "apple";
    id = (await createProfile(await getDb(), admin.email, { name: str(form, "name"), platform })).id;
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  redirect(`/perfis/${id}`);
}

export async function saveProfileSettingsAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateProfileSettings(await getDb(), actor, str(form, "id"), settingsFromForm(form));
    return "Perfil salvo. Os dispositivos com este perfil recebem a mudança na próxima sincronização.";
  });
}

export async function deleteProfileAction(form: FormData) {
  const admin = await requireAdmin();
  await deleteProfile(await getDb(), admin.email, str(form, "id"));
  redirect("/perfis");
}

// ---------- Playlists ----------
function playlistInput(form: FormData): PlaylistInput {
  return {
    name: str(form, "name"),
    type: str(form, "type") === "xtream" ? "xtream" : "m3u",
    url: str(form, "url"),
    username: str(form, "username") || undefined,
    password: String(form.get("password") ?? "") || undefined,
  };
}

export async function createPlaylistAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await createPlaylist(await getDb(), actor, playlistInput(form));
    return "Playlist cadastrada.";
  });
}

export async function updatePlaylistAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => updatePlaylist(await getDb(), actor, str(form, "id"), playlistInput(form)));
}

export async function deletePlaylistAction(form: FormData) {
  const admin = await requireAdmin();
  await deletePlaylist(await getDb(), admin.email, str(form, "id"));
  refresh();
}

// ---------- Grupos ----------
function groupInput(form: FormData) {
  return { name: str(form, "name"), profileId: str(form, "profileId") || null, playlistIds: form.getAll("playlistIds").map(String) };
}

export async function createGroupAction(_p: ActionResult, form: FormData) {
  const admin = await requireAdmin();
  let id: string;
  try {
    id = (await createGroup(await getDb(), admin.email, groupInput(form))).id;
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  redirect(`/grupos/${id}`);
}

export async function updateGroupAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateGroup(await getDb(), actor, str(form, "id"), groupInput(form));
    return "Grupo salvo e aplicado a todos os dispositivos do grupo.";
  });
}

export async function deleteGroupAction(form: FormData) {
  const admin = await requireAdmin();
  await deleteGroup(await getDb(), admin.email, str(form, "id"));
  redirect("/grupos");
}

export async function setDeviceGroupAction(_p: ActionResult, form: FormData) {
  const groupId = str(form, "groupId") || null;
  return run(async (actor) => {
    await setDeviceGroup(await getDb(), actor, str(form, "deviceId"), groupId);
    return groupId ? "Dispositivo adicionado ao grupo; perfil e playlists do grupo aplicados." : "Dispositivo removido do grupo.";
  });
}

/** Plain form variant used by the member list (no inline message). */
export async function removeFromGroupAction(form: FormData) {
  const admin = await requireAdmin();
  await setDeviceGroup(await getDb(), admin.email, str(form, "deviceId"), null);
  refresh();
}

// ---------- Manutenção e políticas ----------
export async function saveMaintenanceAction(_p: ActionResult, form: FormData) {
  const enabled = form.get("enabled") === "on";
  return run(async (actor) => {
    await updateMaintenance(await getDb(), actor, { enabled, message: str(form, "message"), supportLine: str(form, "supportLine") });
    return enabled ? "Modo manutenção ATIVO: os dispositivos mostram a mensagem na próxima consulta." : "Configuração salva. Modo manutenção desligado.";
  });
}

export async function savePoliciesAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updatePolicies(await getDb(), actor, {
      accountNickname: str(form, "accountNickname"),
      supportUrl: str(form, "supportUrl"),
      welcomeMessage: str(form, "welcomeMessage"),
      forceUpdates: form.get("forceUpdates") === "on",
      disableCloudBackups: form.get("disableCloudBackups") === "on",
      channelReportsEnabled: form.get("channelReportsEnabled") === "on",
      alreadyReportedMessage: str(form, "alreadyReportedMessage"),
    });
    return "Políticas salvas. Os dispositivos recebem na próxima consulta.";
  });
}

// ---------- Reportes ----------
export async function setReportStatusAction(form: FormData) {
  const admin = await requireAdmin();
  await setReportStatus(await getDb(), admin.email, str(form, "id"), str(form, "status") === "resolved" ? "resolved" : "open");
  refresh();
}

// ---------- Portal pré-definido ----------
export async function addPredefinedPortalAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await addPredefinedPortal(await getDb(), actor, { type: str(form, "type") === "stalker" ? "stalker" : "xtream", name: str(form, "name"), url: str(form, "url") });
    return "Portal adicionado.";
  });
}

export async function removePredefinedPortalAction(form: FormData) {
  const admin = await requireAdmin();
  await removePredefinedPortal(await getDb(), admin.email, str(form, "id"));
  refresh();
}

export async function setPortalModeAction(_p: ActionResult, form: FormData) {
  const mode = str(form, "mode");
  return run(async (actor) => {
    await setPortalMode(await getDb(), actor, mode === "xtream" || mode === "stalker" ? mode : "off");
    return mode === "off" ? "Portal pré-definido desligado." : "Tipo de portal aplicado.";
  });
}

export async function saveBrandingAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateBranding(await getDb(), actor, {
      logoUrl: str(form, "logoUrl"),
      homeLine: str(form, "homeLine"),
      userAgent: str(form, "userAgent"),
      activationCodeHint: str(form, "activationCodeHint"),
    });
    return "Identidade salva.";
  });
}

// ---------- Sincronização ----------
export async function saveSyncConfigAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateSyncConfig(await getDb(), actor, {
      enabled: form.get("enabled") === "on",
      playlists: form.get("playlists") === "on",
      settings: form.get("settings") === "on",
      favorites: form.get("favorites") === "on",
      profileId: str(form, "profileId") || null,
    });
    return "Sincronização salva. Os dispositivos participantes recebem na próxima consulta.";
  });
}

export async function setDeviceSyncAction(form: FormData) {
  const admin = await requireAdmin();
  await setDeviceSync(await getDb(), admin.email, str(form, "deviceId"), str(form, "enabled") === "true");
  refresh();
}

export async function saveSyncPlaylistsAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await setSyncPlaylists(await getDb(), actor, form.getAll("playlistIds").map(String));
    return "Playlists compartilhadas atualizadas.";
  });
}

export async function addFavoriteAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    const added = await addFavorite(await getDb(), actor, { channelName: str(form, "channelName"), playlistId: str(form, "playlistId") || null });
    return added ? "Favorito adicionado." : "Esse canal já está nos favoritos.";
  });
}

export async function removeFavoriteAction(form: FormData) {
  const admin = await requireAdmin();
  await removeFavorite(await getDb(), admin.email, { id: str(form, "id") });
  refresh();
}

// ---------- Esportes ----------
export async function saveSportsModeAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateSportsMode(await getDb(), actor, { enabled: form.get("enabled") === "on", hiddenSports: form.getAll("hiddenSports").map(String) });
    return "Esportes atualizados.";
  });
}

export async function hideSportEntryAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    const kind = str(form, "kind");
    const added = await hideSportEntry(await getDb(), actor, {
      sport: str(form, "sport") as never,
      kind: kind === "country" || kind === "team" ? kind : "league",
      name: str(form, "name"),
    });
    return added ? "Item ocultado." : "Esse item já está oculto.";
  });
}

export async function unhideSportEntryAction(form: FormData) {
  const admin = await requireAdmin();
  await unhideSportEntry(await getDb(), admin.email, Number(str(form, "index")));
  refresh();
}

// ---------- Ajustes do dispositivo e snapshots ----------
export async function saveDeviceOverridesAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    const n = await setDeviceOverrides(await getDb(), actor, str(form, "deviceId"), settingsFromForm(form));
    return n ? `${n} ajuste(s) próprio(s) deste dispositivo salvos.` : "Tudo igual ao perfil: nenhum ajuste próprio guardado.";
  });
}

export async function clearDeviceOverridesAction(form: FormData) {
  const admin = await requireAdmin();
  await clearDeviceOverrides(await getDb(), admin.email, str(form, "deviceId"));
  refresh();
}

export async function createSnapshotAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await createSnapshot(await getDb(), actor, str(form, "deviceId"), str(form, "name"));
    return "Snapshot salvo.";
  });
}

export async function restoreSnapshotAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await restoreSnapshot(await getDb(), actor, str(form, "snapshotId"), str(form, "deviceId"));
    return "Snapshot aplicado ao dispositivo.";
  });
}

export async function copyDeviceAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await copyDevice(await getDb(), actor, str(form, "sourceId"), str(form, "deviceId"));
    return "Configuração copiada.";
  });
}

export async function deleteSnapshotAction(form: FormData) {
  const admin = await requireAdmin();
  await deleteSnapshot(await getDb(), admin.email, str(form, "id"));
  refresh();
}

// ---------- Integrações e notificações ----------
export async function createApiKeyAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    const { key } = await createApiKey(await getDb(), actor, str(form, "name"));
    // Shown once, never stored in clear.
    return `Chave criada. Copie agora, ela não aparece de novo: ${key}`;
  });
}

export async function revokeApiKeyAction(form: FormData) {
  const admin = await requireAdmin();
  await revokeApiKey(await getDb(), admin.email, str(form, "id"));
  refresh();
}

export async function saveNotificationPrefsAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await updateNotificationPrefs(await getDb(), actor, {
      email: str(form, "email"),
      deviceAdded: form.get("deviceAdded") === "on",
      deviceRemoved: form.get("deviceRemoved") === "on",
      channelReport: form.get("channelReport") === "on",
    });
    return "Preferências de alerta salvas.";
  });
}

export async function sendPendingNotificationsAction() {
  await requireAdmin();
  await flushNotifications(await getDb());
  refresh();
}

// ---------- Conta ----------
export async function changePasswordAction(_p: ActionResult, form: FormData) {
  const admin = await requireAdmin();
  if (str(form, "next") !== str(form, "confirm")) return { error: "A confirmação não confere com a nova senha." };
  try {
    await changePassword(await getDb(), admin.id, String(form.get("current") ?? ""), String(form.get("next") ?? ""));
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  // All sessions were revoked, including this one.
  redirect("/login");
}

// ---------- App da TV ----------

export async function saveAppearanceAction(_p: ActionResult, form: FormData) {
  const logo = form.get("logo");
  return run(async (actor) => {
    const checked = await updateAppearance(await getDb(), actor, {
      appName: str(form, "appName"),
      homeShowFavorites: form.get("homeShowFavorites") === "on",
      homeShowSport: form.get("homeShowSport") === "on",
      homeShowTrending: form.get("homeShowTrending") === "on",
      tmdbLanguage: str(form, "tmdbLanguage") as "pt-BR",
      sportsGroupKeywords: str(form, "sportsGroupKeywords").split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
      logo: logo instanceof File ? logo : null,
      removeLogo: form.get("removeLogo") === "on",
      tmdbKey: str(form, "tmdbKey"),
      removeTmdbKey: form.get("removeTmdbKey") === "on",
    });
    return checked === null ? "Aparência salva. Os aparelhos atualizam em segundos." : `Chave do TMDB conferida: ${checked} títulos em alta. Aparência salva.`;
  });
}

export async function createMessageAction(_p: ActionResult, form: FormData) {
  return run(async (actor) => {
    await createMessage(await getDb(), actor, {
      title: str(form, "title"),
      body: str(form, "body"),
      target: str(form, "target") as "all",
      groupId: str(form, "groupId") || null,
      deviceId: str(form, "deviceId") || null,
      days: Number(str(form, "days") || 0),
    });
    return "Aviso enviado. Os aparelhos mostram no sino em segundos.";
  });
}

export async function deleteMessageAction(form: FormData) {
  await run(async (actor) => deleteMessage(await getDb(), actor, str(form, "id")));
}
