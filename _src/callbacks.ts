import { Context, HttpRequest } from "@azure/functions";
import { AccountSASPermissions } from "@azure/storage-blob";
import { Connection, ConnectionProperty, Contract, Sdk, Tenant, Tag, Datasource, datasource, WorkflowDesign, Workflow, WorkflowHelper, ActionConfiguration, DatasourceHelper, datasourcePayload } from "@nwc-sdk/client";
import { XtensionWorkflow } from "./model";

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
        return (request.query.name)
            ? (await client.getConnections()).find(cn => cn.name === request.query.name)
            : await client.getConnection(request.query.id)
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


const datasource: ExecutionCallback<Datasource> = async (client: Sdk, request: HttpRequest): Promise<Datasource | undefined> => {
    if (request.method === "GET") {
        return request.query.name
            ? (await client.getDatasources()).find(ds => ds.name === request.query.name)
            : await client.getDatasource(request.query.id)
    } else {
        return await client.createDatasource(request.body)
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

const workflow: ExecutionCallback<XtensionWorkflow> = async (client: Sdk, request: HttpRequest): Promise<XtensionWorkflow> =>
    _toXtensionWorkflow(
        (request.query.id)
            ? await client.getWorkflow(request.query.id)
            : await client.getWorkflowByName(request.query.name))


const exportWorkflow: ExecutionCallback<string> = async (client: Sdk, request: HttpRequest): Promise<string> => {
    return await client.exportWorkflow(request.params.workflowId)
}

const importWorkflow: ExecutionCallback<XtensionWorkflow> = async (client: Sdk, request: HttpRequest): Promise<XtensionWorkflow> =>
    _toXtensionWorkflow(
        await client.importWorkflow(request.body.name, request.body.key, request.body.overwrite))

const changeConnection: ExecutionCallback<XtensionWorkflow> = async (client: Sdk, request: HttpRequest): Promise<XtensionWorkflow> => {
    const workflow = await client.getWorkflow(request.params.workflowId)
    const newConnection = await client.getConnection(request.query.newConnectionId)
    WorkflowHelper.swapConnection(workflow, request.query.connectionId, newConnection)
    workflow.info.comments = `Changed connection id ${request.query.connectionId} with ${newConnection.name} (${newConnection.id})`
    return _toXtensionWorkflow(await client.saveWorkflow(workflow))
}

const changeDatasource: ExecutionCallback<XtensionWorkflow> = async (client: Sdk, request: HttpRequest): Promise<XtensionWorkflow> => {
    const workflow = await client.getWorkflow(request.params.workflowId)
    const newDatasource = await client.getDatasource(request.query.newDatasourceId)
    const newConnection = await client.getConnection(newDatasource.connectionId)

    WorkflowHelper.swapDatasource(workflow, request.query.datasourceId, newDatasource, newConnection)
    workflow.info.comments = `Changed datasource with id ${request.query.datasourceId} with ${newDatasource.name} (${newDatasource.id})`
    return _toXtensionWorkflow(await client.saveWorkflow(workflow))
}

const publish: ExecutionCallback<XtensionWorkflow> = async (client: Sdk, request: HttpRequest): Promise<XtensionWorkflow> => {
    const workflow = await client.getWorkflow(request.params.workflowId)
    return _toXtensionWorkflow(await client.publishWorkflow(workflow))
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
    'import': importWorkflow,
    'changeConnection': changeConnection,
    'changeDatasource': changeDatasource,
    'publish': publish
}

export type ExecutionCallback<ReturnType = any> = (client: Sdk, request?: HttpRequest, context?: Context) => Promise<ReturnType | void>;
export const getOperation = (methodName: string): ExecutionCallback => operations[methodName.endsWith('Generic') ? methodName.split('Generic')[0] : methodName]

const _toXtensionWorkflow = (workflow: Workflow): XtensionWorkflow => ({
    id: workflow.id,
    name: workflow.name,
    dependencies: {
        connectors: Object.keys(workflow.dependencies.contracts).map((contractId) => ({
            connectorId: contractId,
            connectorName: workflow.dependencies.contracts[contractId].contractName,
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
    },
    permisions: workflow.permissions
})


