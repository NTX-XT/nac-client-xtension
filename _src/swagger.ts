import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import path from "path";
import { readFile } from "fs/promises";
import { OpenAPIV2 } from "openapi-types";

interface XtensionCustomElements {
  "x-ntx-basePath": string;
}
interface XtensionSwaggerDocument
  extends OpenAPIV2.Document,
    XtensionCustomElements {}
const swagger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const isGeneric: boolean = req.url.includes("/generic/");
  const functionDirectory: string = isGeneric
    ? path.join(context.executionContext.functionDirectory, "../swagger")
    : context.executionContext.functionDirectory;
  const swaggerDocumentPath = path.join(functionDirectory, "swagger.json");
  const swaggerDocument: XtensionSwaggerDocument = await readFile(
    swaggerDocumentPath,
    { encoding: "utf8" }
  ).then((data) => JSON.parse(data));
  swaggerDocument.host = new URL(req.url).host;
  if (isGeneric) {
    swaggerDocument.info.title = `${swaggerDocument.info.title} (generic)`;
    swaggerDocument.basePath = `${swaggerDocument.basePath}/generic`;
    swaggerDocument[
      "x-ntx-basePath"
    ] = `${swaggerDocument["x-ntx-basePath"]}/generic`;
    const parametersDocumentPath = path.join(
      functionDirectory,
      "swagger.parameters.json"
    );
    const parametersDocument: OpenAPIV2.Document = await readFile(
      parametersDocumentPath,
      { encoding: "utf8" }
    ).then((data) => JSON.parse(data));
    swaggerDocument.parameters = parametersDocument.parameters;
    const refs: OpenAPIV2.ReferenceObject[] = Object.keys(
      parametersDocument.parameters!
    ).map((paramName) => ({
      $ref: `#/parameters/${paramName}`,
    }));
    for (const pathName in swaggerDocument.paths) {
      const currentPath = swaggerDocument.paths[pathName];
      if (currentPath.parameters) {
        currentPath.parameters.push(...refs);
      } else {
        currentPath.parameters = refs;
      }
    }
  }
  const securityDocumentPath = path.join(
    functionDirectory,
    isGeneric
      ? "swagger.securityDefinitions.apiKey.json"
      : "swagger.securityDefinitions.oauth2.json"
  );
  const securityDocument: OpenAPIV2.Document = await readFile(
    securityDocumentPath,
    { encoding: "utf8" }
  ).then((data) => JSON.parse(data));
  const definition = securityDocument.securityDefinitions![
    "oauth2"
  ] as OpenAPIV2.SecuritySchemeOauth2Application;
  definition.tokenUrl = req.url.replace(
    context.bindingData.sys.methodName,
    "auth"
  );
  swaggerDocument.securityDefinitions = securityDocument.securityDefinitions;
  swaggerDocument.security = securityDocument.security;
  context.res = {
    status: 200,
    body: swaggerDocument,
  };
};

export default swagger;
