import {
  client,
  methods,
  type Client,
  type ClientConnection,
  type Stream,
} from '@agentclientprotocol/sdk';
import {
  MAYHEM_EXT_AGENT_REQUESTS,
  MAYHEM_EXT_NOTIFICATIONS,
  MayhemExtClient,
  type MayhemSessionNotification_unstable,
  type ProviderDeviceCodeNotification_unstable,
  type RecipeParamsResponse_unstable,
  type RequestRecipeParams_unstable,
  zMayhemSessionNotification_unstable,
  zProviderDeviceCodeNotification_unstable,
  zRequestRecipeParams_unstable,
} from '@aaif/mayhem-acp-client';

const [mayhemSessionUpdate, providerDeviceCode] = MAYHEM_EXT_NOTIFICATIONS;
const [mayhemRecipeParamsRequest] = MAYHEM_EXT_AGENT_REQUESTS;

export type MayhemAcpCallbacks = Required<
  Pick<Client, 'requestPermission' | 'sessionUpdate' | 'createElicitation'>
> & {
  unstable_sessionRecipeRequestParams: (
    request: RequestRecipeParams_unstable
  ) => Promise<RecipeParamsResponse_unstable>;
  unstable_sessionUpdate: (notification: MayhemSessionNotification_unstable) => Promise<void>;
  unstable_providerDeviceCode: (
    notification: ProviderDeviceCodeNotification_unstable
  ) => Promise<void>;
};

export type MayhemAcpClient = {
  connection: ClientConnection;
  mayhem: MayhemExtClient;
};

export function connectMayhemAcpClient(
  stream: Stream,
  callbacks: MayhemAcpCallbacks
): MayhemAcpClient {
  const app = client({ name: 'mayhem' })
    .onRequest(methods.client.session.requestPermission, (context) =>
      callbacks.requestPermission(context.params)
    )
    .onNotification(methods.client.session.update, (context) =>
      callbacks.sessionUpdate(context.params)
    )
    .onRequest(methods.client.elicitation.create, (context) =>
      callbacks.createElicitation(context.params)
    )
    .onRequest(mayhemRecipeParamsRequest.method, zRequestRecipeParams_unstable, (context) =>
      callbacks.unstable_sessionRecipeRequestParams(context.params)
    )
    .onNotification(mayhemSessionUpdate.method, zMayhemSessionNotification_unstable, (context) =>
      callbacks.unstable_sessionUpdate(context.params)
    )
    .onNotification(
      providerDeviceCode.method,
      zProviderDeviceCodeNotification_unstable,
      (context) => callbacks.unstable_providerDeviceCode(context.params)
    );

  const connection = app.connect(stream);
  const mayhem = new MayhemExtClient(connection.agent);

  return { connection, mayhem };
}
