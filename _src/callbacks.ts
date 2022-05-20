import { Context, HttpRequest } from "@azure/functions";
import { Connection, ConnectionProperty, Contract, Sdk, Tenant, Tag } from "@nwc-sdk/client";

const tenant = (sdk: Sdk): Promise<Tenant> => {
    const tenant = sdk.tenant
    return Promise.resolve(tenant)
}

const tags: ExecutionCallback<Tag[]> = async (client: Sdk): Promise<Tag[]> => {
    return await client.getTags()
}

const contracts: ExecutionCallback<Contract[]> = async (client: Sdk): Promise<Contract[]> => {
    return await client.getContracts()
}

const connections: ExecutionCallback<Connection[]> = async (client: Sdk): Promise<Connection[]> => {
    return await client.getConnections()
}

const connection: ExecutionCallback<Connection> = async (client: Sdk, request: HttpRequest, context: Context): Promise<Connection> => {
    context.log.info('CONNEcTION CREATE')
    if (request.method === "GET") {
        if (request.query.name) {
            return (await client.getConnections()).find(cn => cn.name === request.query.name)
        } else {
            return (await client.getConnections()).find(cn => cn.id === request.query.id)
        }
    } else {
        const contract = await client.getContract(request.body.contractId)
        const props = {}
        for (const p of request.body.parameters) {
            props[p.name] = p.value
        }
        props["connectionDisplayName"] = request.body.name
        try {
            return (await client.createConnection(contract, props))
        } catch (err) {
            context.log.error(err)
        }
    }
}

const contract: ExecutionCallback<Contract> = async (client: Sdk, request: HttpRequest): Promise<Contract> => {
    if (request.query.name) {
        return await client.getContractByName(request.query.name)
    } else {
        return await client.getContract(request.query.id)
    }
}

const connectionProperties: ExecutionCallback<{ [key: string]: ConnectionProperty }> = async (client: Sdk, request: HttpRequest): Promise<{ [key: string]: ConnectionProperty }> => {
    return await client.getContractConnectionProperties(request.params.contractId)
}

const operations: { [route: string]: ExecutionCallback } = {
    'tenant': tenant,
    'contract': contract,
    'contracts': contracts,
    'connection': connection,
    'connections': connections,
    'connectionProperties': connectionProperties,
    'tags': tags
}



export type ExecutionCallback<ReturnType = any> = (client: Sdk, request?: HttpRequest, context?: Context) => Promise<ReturnType | void>;
export const getOperation = (methodName: string): ExecutionCallback => operations[methodName.endsWith('Generic') ? methodName.split('Generic')[0] : methodName]
