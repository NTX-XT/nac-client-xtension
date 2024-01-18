import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { Client, ClientCredentials } from "@ntx-xt/nac-client";

const getClientCredentialsFromStringBody = (
  value: string
): ClientCredentials => {
  const items: Record<string, string> = {};
  const parts = (value as String).split("&");
  for (const part of parts) {
    const pair: string[] = part.split("=");
    items[pair[0]] = pair[1];
  }
  return {
    clientId: items["client_id"],
    clientSecret: items["client_secret"],
  };
};

const auth: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log({
    headers: req.headers,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (req.body && (req.body as String).indexOf("&") > 0) {
    // NAC Authenticating
    const access_token = await Client.authenticate(
      getClientCredentialsFromStringBody(req.body)
    );
    context.res = {
      status: 200,
      body: access_token,
    };
  } else {
    context.res = {
      status: 401,
    };
  }
};

export default auth;
