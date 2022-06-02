import { Connection, ConnectionDependency, Datasource, DatasourceDependency } from "@nwc-sdk/client";
import { WorkflowPermissions } from "@nwc-sdk/client";

export interface XtensionWorkflow {
    id: string;
    name: string;
    dependencies: {
        connectors: {
            connectorId: string;
            connectorName: string;
            connections: {
                connectionId: string;
                connectionName: string;
                actions: string[];
                datasources: string[];
            }[];
        }[];
        workflows: {
            workflowId: string;
            actions: string[];
        }[];
    };
    permisions: WorkflowPermissions;
    // connections: ConnectionDependency[];
    // datasources: DatasourceDependency[];
}
