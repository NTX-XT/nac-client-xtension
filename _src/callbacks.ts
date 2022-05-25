import { Context, HttpRequest } from "@azure/functions";
import { AccountSASPermissions } from "@azure/storage-blob";
import { Connection, ConnectionProperty, Contract, Sdk, Tenant, Tag, Datasource, datasource, WorkflowDesign, Workflow } from "@nwc-sdk/client";

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
            context.log(request.body)
            return (await client.createConnection(contract, props))
        } catch (err) {
            context.log.error(err)
        }
    }
}

const datasources: ExecutionCallback<Datasource[]> = async (client: Sdk, request: HttpRequest): Promise<Datasource[]> => {
    const datasources = await client.getDatasources()
    return request.query.contractId
        ? datasources.filter(ds => ds.contractId === request.query.contractId)
        : request.query.connectionId
            ? datasources.filter(ds => ds.connectionId === request.query.connectionId)
            : datasources
}


const datasource: ExecutionCallback<Datasource> = async (client: Sdk, request: HttpRequest): Promise<Datasource> => {
    if (request.method === "GET") {
        return request.query.name
            ? (await client.getDatasources()).find(ds => ds.name === request.query.name)
            : (await client.getDatasources()).find(ds => ds.id === request.query.id)
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

const workflows: ExecutionCallback<WorkflowDesign[]> = async (client: Sdk, request: HttpRequest): Promise<WorkflowDesign[]> => {
    if (request.query.tag) {
        return await client.getWorkflowDesigns({ tag: request.query.tag })
    } else {
        return await client.getWorkflowDesigns()
    }
}

const workflow: ExecutionCallback<Workflow> = async (client: Sdk, request: HttpRequest): Promise<Workflow> => {
    const workflow = (request.query.id)
        ? await client.getWorkflow(request.query.id)
        : await client.getWorkflowByName(request.query.name)
    prepareWorkflow(workflow)
    return workflow
}

const exportWorkflow: ExecutionCallback<string> = async (client: Sdk, request: HttpRequest): Promise<string> => {
    return await client.exportWorkflow(request.params.workflowId)
}

const importWorkflow: ExecutionCallback<Workflow> = async (client: Sdk, request: HttpRequest): Promise<Workflow> => {
    const workflow = await client.importWorkflow(request.body.name, request.body.key, request.body.overwrite)
    prepareWorkflow(workflow)
    return workflow
}

const operations: { [route: string]: ExecutionCallback } = {
    'tenant': tenant,
    'contract': contract,
    'contracts': contracts,
    'connection': connection,
    'connections': connections,
    'datasources': datasources,
    'datasource': datasource,
    'connectionProperties': connectionProperties,
    'tags': tags,
    'workflows': workflows,
    'workflow': workflow,
    'export': exportWorkflow,
    'import': importWorkflow
}

export type ExecutionCallback<ReturnType = any> = (client: Sdk, request?: HttpRequest, context?: Context) => Promise<ReturnType | void>;
export const getOperation = (methodName: string): ExecutionCallback => operations[methodName.endsWith('Generic') ? methodName.split('Generic')[0] : methodName]

function prepareWorkflow(workflow: Workflow) {
    const deps = {
        constracts: Object.keys(workflow.dependencies.contracts).map((contractId) => ({
            contractId: contractId,
            contractName: workflow.dependencies.contracts[contractId].contractName,
            connections: Object.keys(workflow.dependencies.contracts[contractId].connections).map((connectionId) => ({
                connectionId: connectionId,
                connectionName: workflow.dependencies.contracts[contractId].connections[connectionId].connectionName,
                actions: Object.keys(workflow.dependencies.contracts[contractId].connections[connectionId].actions),
                datasources: Object.keys(workflow.dependencies.contracts[contractId].connections[connectionId].datasources)
            }))
        })),
        workflows: Object.keys(workflow.dependencies.workflows).map((workflowId) => ({
            workflowId: workflowId,
            actions: workflow.dependencies.workflows[workflowId].actionIds
        }))
    };

    delete workflow.definition;
    delete workflow.info;
    delete workflow.startEvents;
    delete workflow.forms;
    delete workflow.dependencies;

    workflow["deps"] = deps;
    return workflow;
}

