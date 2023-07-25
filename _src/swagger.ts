import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import path from 'path'
import { readFile } from 'fs/promises'
import { OpenAPIV2 } from 'openapi-types'

interface XtensionCustomElements {
	'x-ntx-basePath': string
}
interface XtensionSwaggerDocument extends OpenAPIV2.Document, XtensionCustomElements {

}
const swagger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
	const isGeneric: boolean = req.url.includes('/generic/');
	const functionDirectory: string = isGeneric
		? path.join(context.executionContext.functionDirectory, "../swagger")
		: context.executionContext.functionDirectory
	const swaggerDocumentPath = path.join(functionDirectory, 'swagger.json')
	const swaggerDocument: XtensionSwaggerDocument = await readFile(swaggerDocumentPath, { encoding: 'utf8' }).then(data => JSON.parse(data))
	swaggerDocument.host = new URL(req.url).host
	if (isGeneric) {
		swaggerDocument.info.title = `${swaggerDocument.info.title} (generic)`
		swaggerDocument.basePath = `${swaggerDocument.basePath}/generic`
		swaggerDocument['x-ntx-basePath'] = `${swaggerDocument['x-ntx-basePath']}/generic`
		const parametersDocumentPath = path.join(functionDirectory, 'swagger.parameters.json')
		const parametersDocument: OpenAPIV2.Document = await readFile(parametersDocumentPath, { encoding: 'utf8' }).then(data => JSON.parse(data))
		swaggerDocument.parameters = parametersDocument.parameters
		const refs: OpenAPIV2.ReferenceObject[] = Object.keys(parametersDocument.parameters!).map(paramName => ({
			$ref: `#/parameters/${paramName}`,
		}))
		for (const pathName in swaggerDocument.paths) {
			const currentPath = swaggerDocument.paths[pathName]
			if (currentPath.parameters) {
				currentPath.parameters.push(...refs)
			} else {
				currentPath.parameters = refs;
			}
			// for (const operationName in currentPath) {
			// 	const operation: OpenAPIV2.OperationObject = currentPath[operationName]
			// 	for (const parameterName in operation.parameters) {
			// 		const currentParameter = operation.parameters[parameterName]
			// 		if (currentParameter["x-ntx-dynamic-values"]) {
			// 			if (!currentParameter["x-ntx-dynamic-values"].parameters) {
			// 				currentParameter["x-ntx-dynamic-values"].parameters = {}
			// 			}
			// 			for (const p in parametersDocument.parameters) {
			// 				const pName = parametersDocument.parameters[p].name
			// 				currentParameter["x-ntx-dynamic-values"].parameters[pName] = {
			// 					"parameter": pName
			// 				}
			// 			}
			// 		}
			// 	}
			// }
		}
	}
	const securityDocumentPath = path.join(functionDirectory, isGeneric ? 'swagger.securityDefinitions.apiKey.json' : 'swagger.securityDefinitions.oauth2.json')
	const securityDocument: OpenAPIV2.Document = await readFile(securityDocumentPath, { encoding: 'utf8' }).then(data => JSON.parse(data))
	swaggerDocument.securityDefinitions = securityDocument.securityDefinitions
	swaggerDocument.security = securityDocument.security
	context.res = {
		status: 200,
		body: swaggerDocument,
	}
}

export default swagger
