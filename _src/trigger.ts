import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { ApiError, ClientCredentials, isError, Sdk } from "@nwc-sdk/client";
import { getOperation } from "./callbacks";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const client = await connect(getConnectionDetails(req))
    if (isError(client)) {
        context.log.error("Unauthorized")
        context.res = {
            status: 401,
            body: "Unauthorized"
        }
    } else {
        const result = await getOperation(context.bindingData.sys.methodName)(client, req, context)
        context.res = {
            status: 200,
            body: result ?? ""
        }

    }
};

async function connect(connectionDetails: ClientCredentials | string): Promise<Sdk | ApiError> {
    return (typeof connectionDetails === "string" ? Sdk.connectWithToken(connectionDetails) : Sdk.connectWithClientCredentials(connectionDetails))
        .then(sdk => sdk)
        .catch(error => error)
}

function getConnectionDetails(req: HttpRequest): ClientCredentials | string {
    return req.headers.authorization
        ? req.headers.authorization.split(' ')[1].trim()
        : {
            clientId: req.headers.client_id!,
            clientSecret: req.headers.client_secret!,
        }
}

export default httpTrigger;