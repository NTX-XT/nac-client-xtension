import { Context, HttpRequest } from "@azure/functions";
import { AccountSASPermissions } from "@azure/storage-blob";
import {
  Connection,
  ConnectionProperty,
  Contract,
  Client,
  Tenant,
  Tag,
  Datasource,
  datasource,
  WorkflowDesign,
  Workflow,
  WorkflowHelper,
  ActionConfiguration,
  DatasourceHelper,
  datasourcePayload,
  WorkflowInstance,
} from "@ntx-xt/nac-client";
import { XtensionWorkflow } from "./model";

const tenant = (client: Client): Promise<Tenant> => {
  const tenant = client.tenant;
  return Promise.resolve(tenant);
};

const tags: ExecutionCallback<Tag[]> = async (
  client: Client
): Promise<Tag[]> => {
  return await client.getTags();
};

const contracts: ExecutionCallback<Contract[]> = async (
  client: Client
): Promise<Contract[]> => {
  return await client.getContracts();
};

const connections: ExecutionCallback<Connection[]> = async (
  client: Client
): Promise<Connection[]> => {
  return await client.getConnections();
};

const connection: ExecutionCallback<Connection | undefined> = async (
  client: Client,
  request: HttpRequest,
  context: Context
): Promise<Connection | undefined> => {
  if (request.method === "GET") {
    return request.query.name
      ? (await client.getConnections()).find(
          (cn) => cn.name === request.query.name
        )
      : await client.getConnection(request.query.id);
  } else {
    const contract = await client.getContract(request.body.contractId);
    if (contract) {
      const props: Record<string, string> = {};
      for (const p of request.body.parameters) {
        props[p.name] = p.value;
      }
      props["connectionDisplayName"] = request.body.name;
      try {
        context.log(request.body);
        return await client.createConnection(contract, props);
      } catch (err) {
        context.log.error(err);
      }
    } else {
      context.log.error("Contract not found");
    }
  }
};

const datasources: ExecutionCallback<Datasource[]> = async (
  client: Client,
  request: HttpRequest
): Promise<Datasource[]> => {
  const datasources = await client.getDatasources();
  return request.query.contractId
    ? datasources.filter((ds) => ds.contractId === request.query.contractId)
    : request.query.connectionId
    ? datasources.filter((ds) => ds.connectionId === request.query.connectionId)
    : datasources;
};

const datasource: ExecutionCallback<Datasource> = async (
  client: Client,
  request: HttpRequest
): Promise<Datasource | undefined> => {
  if (request.method === "GET") {
    return request.query.name
      ? (await client.getDatasources()).find(
          (ds) => ds.name === request.query.name
        )
      : await client.getDatasource(request.query.id);
  } else {
    return await client.createDatasource(request.body);
  }
};

const contract: ExecutionCallback<Contract | undefined> = async (
  client: Client,
  request: HttpRequest
): Promise<Contract | undefined> => {
  if (request.query.name) {
    return await client.getContractByName(request.query.name);
  } else {
    return await client.getContract(request.query.id);
  }
};

const connectionPropertiesSchema: ExecutionCallback<{
  [key: string]: ConnectionProperty;
}> = async (
  client: Client,
  request: HttpRequest
): Promise<{ [key: string]: ConnectionProperty }> => {
  return await client.getContractConnectionProperties(
    request.params.contractId
  );
};

const connectionProperties: ExecutionCallback<{
  [key: string]: ConnectionProperty;
}> = async (
  client: Client,
  request: HttpRequest
): Promise<{ [key: string]: ConnectionProperty }> => {
  return await client
    .getConnectionSchema(request.params.id)
    .then((cn) => cn.properties);
};

const workflows: ExecutionCallback<WorkflowDesign[]> = async (
  client: Client,
  request: HttpRequest
): Promise<WorkflowDesign[]> => {
  if (request.query.tag) {
    return await client.getWorkflowDesigns({ tag: request.query.tag });
  } else {
    return await client.getWorkflowDesigns();
  }
};

const workflow: ExecutionCallback<XtensionWorkflow> = async (
  client: Client,
  request: HttpRequest
): Promise<XtensionWorkflow> => {
  if (request.query.id) {
    return _toXtensionWorkflow(await client.getWorkflow(request.query.id));
  } else if (request.query.name) {
    const wfl = await client.getWorkflowByName(request.query.name);
    if (wfl) {
      return _toXtensionWorkflow(wfl);
    }
  }
  throw "Workflow not found";
};

const workflowInstance: ExecutionCallback<WorkflowInstance> = async (
  client: Client,
  request: HttpRequest
): Promise<WorkflowInstance> =>
  await client.getWorkflowInstance(request.query.id);

const exportWorkflow: ExecutionCallback<string> = async (
  client: Client,
  request: HttpRequest
): Promise<string> => {
  return await client.exportWorkflow(request.params.workflowId, request.body);
};

const importWorkflow: ExecutionCallback<XtensionWorkflow> = async (
  client: Client,
  request: HttpRequest
): Promise<XtensionWorkflow> =>
  _toXtensionWorkflow(
    await client.importWorkflow(
      request.body.name,
      request.body.key,
      request.body.overwrite
    )
  );

const startWorkflow: ExecutionCallback<WorkflowInstance> = async (
  client: Client,
  request: HttpRequest,
  context: Context
): Promise<WorkflowInstance> => {
  const startData = request.body
    ? JSON.parse(request.body)
    : undefined;
  context.log(startData);
  return await client.startWorkflow(request.params.workflowId, startData);
};

const changeConnection: ExecutionCallback<XtensionWorkflow> = async (
  client: Client,
  request: HttpRequest
): Promise<XtensionWorkflow> => {
  const workflow = await client.getWorkflow(request.params.workflowId);
  const newConnection = await client.getConnection(
    request.query.newConnectionId
  );
  if (newConnection) {
    const newContract = await client.getContract(newConnection.contractId);
    if (newContract) {
      const newContractSchema = await client.getContractSchema(
        newConnection.contractId
      );
      WorkflowHelper.swapConnection(
        workflow,
        request.query.connectionId,
        newConnection,
        request.query.connectionName,
        newContract,
        newContractSchema
      );
      workflow.info.comments = `Changed connection id ${request.query.connectionId} with ${newConnection.name} (${newConnection.id})`;
      return _toXtensionWorkflow(await client.saveWorkflow(workflow));
    } else {
      throw "Contract not found";
    }
  } else {
    throw "Connection not found";
  }
};

const changeDatasource: ExecutionCallback<XtensionWorkflow> = async (
  client: Client,
  request: HttpRequest
): Promise<XtensionWorkflow> => {
  const workflow = await client.getWorkflow(request.params.workflowId);
  const newDatasource = await client.getDatasource(
    request.query.newDatasourceId
  );
  const newConnection = await client.getConnection(newDatasource.connectionId);
  if (newConnection) {
    WorkflowHelper.swapDatasource(
      workflow,
      request.query.datasourceId,
      newDatasource,
      newConnection
    );
    workflow.info.comments = `Changed datasource with id ${request.query.datasourceId} with ${newDatasource.name} (${newDatasource.id})`;
    return _toXtensionWorkflow(await client.saveWorkflow(workflow));
  } else {
    throw "Connection not found";
  }
};

const publish: ExecutionCallback<XtensionWorkflow> = async (
  client: Client,
  request: HttpRequest
): Promise<XtensionWorkflow> => {
  const workflow = await client.getWorkflow(request.params.workflowId);
  return _toXtensionWorkflow(await client.publishWorkflow(workflow));
};

const operations: { [route: string]: ExecutionCallback } = {
  tenant: tenant,
  contract: contract,
  contracts: contracts,
  connection: connection,
  connections: connections,
  datasources: datasources,
  datasource: datasource,
  connectionPropertiesSchema: connectionPropertiesSchema,
  connectionProperties: connectionProperties,
  tags: tags,
  workflows: workflows,
  workflow: workflow,
  export: exportWorkflow,
  import: importWorkflow,
  changeConnection: changeConnection,
  changeDatasource: changeDatasource,
  publish: publish,
  startWorkflow: startWorkflow,
  workflowInstance: workflowInstance
};

export type ExecutionCallback<ReturnType = any> = (
  client: Client,
  request: HttpRequest,
  context: Context
) => Promise<ReturnType | void>;
export const getOperation = (methodName: string): ExecutionCallback =>
  operations[
    methodName.endsWith("Generic") ? methodName.split("Generic")[0] : methodName
  ];

const _toXtensionWorkflow = (workflow: Workflow): XtensionWorkflow => ({
  id: workflow.id,
  name: workflow.name,
  dependencies: {
    connectors: Object.keys(workflow.dependencies.contracts).map(
      (contractId) => ({
        connectorId: contractId,
        connectorName: workflow.dependencies.contracts[contractId].contractName,
        connections: Object.keys(
          workflow.dependencies.contracts[contractId].connections
        ).map((connectionId) => ({
          connectionId: connectionId,
          connectionName:
            workflow.dependencies.contracts[contractId].connections[
              connectionId
            ].connectionName,
          actions: Object.keys(
            workflow.dependencies.contracts[contractId].connections[
              connectionId
            ].actions
          ),
          datasources: Object.keys(
            workflow.dependencies.contracts[contractId].connections[
              connectionId
            ].datasources
          ),
        })),
      })
    ),
    workflows: Object.keys(workflow.dependencies.workflows).map(
      (workflowId) => ({
        workflowId: workflowId,
        actions: workflow.dependencies.workflows[workflowId].actionIds,
      })
    ),
  },
  permisions: workflow.permissions,
  formUrl: workflow.startFormUrl,
});
