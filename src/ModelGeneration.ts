import * as Handlebars from "handlebars";
import * as Prettier from "prettier";
import * as changeCase from "change-case";
import * as fs from "fs";
import * as path from "path";
import IConnectionOptions from "./IConnectionOptions";
import IGenerationOptions from "./IGenerationOptions";
import { Entity } from "./models/Entity";
import { Relation } from "./models/Relation";

export default function modelGenerationPhase(
    connectionOptions: IConnectionOptions,
    generationOptions: IGenerationOptions,
    databaseModel: Entity[]
): void {
    createHandlebarsHelpers(generationOptions);
    const templatePath = path.resolve(__dirname, "templates", "entity.mst");
    const template = fs.readFileSync(templatePath, "UTF-8");
    const resultPath = generationOptions.resultsPath;
    if (!fs.existsSync(resultPath)) {
        fs.mkdirSync(resultPath);
    }
    let entitiesPath = resultPath;
    if (!generationOptions.noConfigs) {
        createTsConfigFile(resultPath);
        createTypeOrmConfig(resultPath, connectionOptions);
        entitiesPath = path.resolve(resultPath, "./entities");
        if (!fs.existsSync(entitiesPath)) {
            fs.mkdirSync(entitiesPath);
        }
    }
    const compliedTemplate = Handlebars.compile(template, {
        noEscape: true
    });
    databaseModel.forEach(element => {
        let casedFileName = "";
        switch (generationOptions.convertCaseFile) {
            case "camel":
                casedFileName = changeCase.camelCase(element.tscName);
                break;
            case "param":
                casedFileName = changeCase.paramCase(element.tscName);
                break;
            case "pascal":
                casedFileName = changeCase.pascalCase(element.tscName);
                break;
            case "none":
                casedFileName = element.tscName;
                break;
            default:
                throw new Error("Unknown case style");
        }
        const resultFilePath = path.resolve(
            entitiesPath,
            `${casedFileName}.ts`
        );
        const rendered = compliedTemplate(element);
        const withImportStatements = removeUnusedImports(rendered);
        const formatted = Prettier.format(withImportStatements, {
            parser: "typescript"
        });
        fs.writeFileSync(resultFilePath, formatted, {
            encoding: "UTF-8",
            flag: "w"
        });
    });
}
function removeUnusedImports(rendered: string) {
    const openBracketIndex = rendered.indexOf("{") + 1;
    const closeBracketIndex = rendered.indexOf("}");
    const imports = rendered
        .substring(openBracketIndex, closeBracketIndex)
        .split(",");
    const restOfEntityDefinition = rendered.substring(closeBracketIndex);
    const distinctImports = imports.filter(
        v => restOfEntityDefinition.indexOf(v) !== -1
    );
    return `${rendered.substring(0, openBracketIndex)}${distinctImports.join(
        ","
    )}${restOfEntityDefinition}`;
}

function createHandlebarsHelpers(generationOptions: IGenerationOptions): void {
    Handlebars.registerHelper("json", context => {
        const json = JSON.stringify(context);
        const withoutQuotes = json.replace(/"([^(")"]+)":/g, "$1:");
        return withoutQuotes.slice(1, withoutQuotes.length - 1);
    });
    Handlebars.registerHelper("toEntityName", str => {
        let retStr = "";
        switch (generationOptions.convertCaseEntity) {
            case "camel":
                retStr = changeCase.camelCase(str);
                break;
            case "pascal":
                retStr = changeCase.pascalCase(str);
                break;
            case "none":
                retStr = str;
                break;
            default:
                throw new Error("Unknown case style");
        }
        return retStr;
    });
    Handlebars.registerHelper("toFileName", str => {
        let retStr = "";
        switch (generationOptions.convertCaseFile) {
            case "camel":
                retStr = changeCase.camelCase(str);
                break;
            case "param":
                retStr = changeCase.paramCase(str);
                break;
            case "pascal":
                retStr = changeCase.pascalCase(str);
                break;
            case "none":
                retStr = str;
                break;
            default:
                throw new Error("Unknown case style");
        }
        return retStr;
    });
    Handlebars.registerHelper("printPropertyVisibility", () =>
        // TODO:
        generationOptions.propertyVisibility !== "none"
            ? `${generationOptions.propertyVisibility} `
            : ""
    );
    Handlebars.registerHelper("toPropertyName", str => {
        let retStr = "";
        switch (generationOptions.convertCaseProperty) {
            case "camel":
                retStr = changeCase.camelCase(str);
                break;
            case "pascal":
                retStr = changeCase.pascalCase(str);
                break;
            case "none":
                retStr = str;
                break;
            default:
                throw new Error("Unknown case style");
        }
        return retStr;
    });
    Handlebars.registerHelper(
        "toRelation",
        (entityType: string, relationType: Relation["relationType"]) => {
            let retVal = entityType;
            if (relationType === "ManyToMany" || relationType === "OneToMany") {
                retVal = `${retVal}[]`;
            }
            if (generationOptions.lazy) {
                retVal = `Promise<${retVal}>`;
            }
            return retVal;
        }
    );
    Handlebars.registerHelper("strictMode", () =>
        // TODO:
        generationOptions.strictMode ? generationOptions.strictMode : ""
    );
    Handlebars.registerHelper({
        and: (v1, v2) => v1 && v2,
        eq: (v1, v2) => v1 === v2,
        gt: (v1, v2) => v1 > v2,
        gte: (v1, v2) => v1 >= v2,
        lt: (v1, v2) => v1 < v2,
        lte: (v1, v2) => v1 <= v2,
        ne: (v1, v2) => v1 !== v2,
        or: (v1, v2) => v1 || v2
    });
}

function createTsConfigFile(outputPath: string): void {
    const templatePath = path.resolve(__dirname, "templates", "tsconfig.mst");
    const template = fs.readFileSync(templatePath, "UTF-8");
    const compliedTemplate = Handlebars.compile(template, {
        noEscape: true
    });
    const rendered = compliedTemplate({});
    const formatted = Prettier.format(rendered, { parser: "json" });
    const resultFilePath = path.resolve(outputPath, "tsconfig.json");
    fs.writeFileSync(resultFilePath, formatted, {
        encoding: "UTF-8",
        flag: "w"
    });
}
function createTypeOrmConfig(
    outputPath: string,
    connectionOptions: IConnectionOptions
): void {
    const templatePath = path.resolve(__dirname, "templates", "ormconfig.mst");
    const template = fs.readFileSync(templatePath, "UTF-8");
    const compliedTemplate = Handlebars.compile(template, {
        noEscape: true
    });
    const rendered = compliedTemplate(connectionOptions);
    const formatted = Prettier.format(rendered, { parser: "json" });
    const resultFilePath = path.resolve(outputPath, "ormconfig.json");
    fs.writeFileSync(resultFilePath, formatted, {
        encoding: "UTF-8",
        flag: "w"
    });
}