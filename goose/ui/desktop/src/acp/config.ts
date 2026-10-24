import { getAcpClient } from './acpConnection';

export type ConfigReadValue = unknown;
export type MaskedConfigValue = { maskedValue: string };

export function isMaskedConfigValue(value: unknown): value is MaskedConfigValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'maskedValue' in value &&
    typeof value.maskedValue === 'string'
  );
}

export function hasConfiguredSecret(value: unknown): boolean {
  return isMaskedConfigValue(value) && value.maskedValue.length > 0;
}

export async function acpReadConfig(
  key: string,
  isSecret: boolean = false
): Promise<ConfigReadValue> {
  const client = await getAcpClient();
  const { value } = await client.mayhem.configRead_unstable({ key, isSecret });
  if (value == null) {
    return null;
  }
  if (isSecret) {
    return { maskedValue: value as string } satisfies MaskedConfigValue;
  }
  return value;
}

export async function acpUpsertConfig(
  key: string,
  value: unknown,
  isSecret: boolean = false
): Promise<void> {
  const client = await getAcpClient();
  await client.mayhem.configUpsert_unstable({ key, value, isSecret });
}

export async function acpRemoveConfig(key: string, isSecret: boolean): Promise<void> {
  const client = await getAcpClient();
  await client.mayhem.configRemove_unstable({ key, isSecret });
}

export async function acpReadAllConfig(): Promise<Record<string, unknown>> {
  const client = await getAcpClient();
  const { config } = await client.mayhem.configReadAll_unstable({});
  return config;
}
