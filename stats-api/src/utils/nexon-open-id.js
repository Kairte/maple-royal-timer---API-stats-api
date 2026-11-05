const CHARACTER_LIST_URL = "https://open.api.nexon.com/maplestory/v1/character/list";
const CHARACTER_LIST_TIMEOUT_MS = 12000;

export async function fetchNexonOpenIdCharacters(accessToken) {
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new TypeError("A server-side Nexon Open ID access token is required.");
  }

  const response = await fetch(CHARACTER_LIST_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(CHARACTER_LIST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error("Nexon Open ID character list request failed.");
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  if (!Array.isArray(data?.account_list)) {
    throw new Error("Unexpected Nexon Open ID character list response.");
  }

  const characters = [];
  for (const account of data.account_list) {
    for (const character of account?.character_list ?? []) {
      if (typeof character?.character_name !== "string" || !character.character_name.trim()) continue;
      if (typeof character.world_name !== "string" || !character.world_name.trim()) continue;
      characters.push({
        characterName: character.character_name,
        worldName: character.world_name,
        jobName: typeof character.character_class === "string" ? character.character_class : "",
        level: Number.isFinite(character.character_level) ? character.character_level : null,
      });
    }
  }
  return characters;
}
