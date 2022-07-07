import { Permission } from "@nwc-sdk/client";

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
    permisions: Permission[];
    formUrl?: string;
}
