import type {
  LiveVoiceAvailabilityResponse_unstable,
  LiveVoiceStartResponse_unstable,
} from '@aaif/mayhem-acp-client';
import { getAcpClient } from './acpConnection';

export async function acpGetLiveVoiceAvailability(
  sessionId?: string
): Promise<LiveVoiceAvailabilityResponse_unstable> {
  const { mayhem } = await getAcpClient();
  return mayhem.sessionLiveVoiceAvailability_unstable(sessionId ? { sessionId } : {});
}

export async function acpStartLiveVoice(
  sessionId: string,
  offerSdp: string
): Promise<LiveVoiceStartResponse_unstable> {
  const { mayhem } = await getAcpClient();
  return mayhem.sessionLiveVoiceStart_unstable({
    sessionId,
    offerSdp,
  });
}

export async function acpStopLiveVoice(sessionId: string, interactionId: string): Promise<void> {
  const { mayhem } = await getAcpClient();
  await mayhem.sessionLiveVoiceStop_unstable({ sessionId, interactionId });
}
