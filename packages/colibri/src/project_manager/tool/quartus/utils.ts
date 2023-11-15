// Copyright 2023
// Carlos Alberto Ruiz Naranjo [carlosruiznaranjo@gmail.com]
//
// This file is part of TerosHDL
//
// Colibri is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Colibri is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with TerosHDL.  If not, see <https://www.gnu.org/licenses/>.

import { e_config } from "../../../config/config_declaration";
import { p_result } from "../../../process/common";
import { t_board_list, t_loader_action_result } from "../common";
import * as process_utils from "../../../process/utils";
import * as process from "../../../process/process";
import * as file_utils from "../../../utils/file_utils";
import { get_toplevel_from_path } from "../../../utils/hdl_utils";
import * as path_lib from "path";
import { get_files_from_csv } from "../../prj_loaders/csv_loader";
import { t_file } from "../../common";
import { LANGUAGE } from "../../../common/general";
import * as nunjucks from 'nunjucks';

export const LANGUAGE_MAP: Record<LANGUAGE, string> = {
    [LANGUAGE.VHDL]: "VHDL_FILE",
    [LANGUAGE.VERILOG]: "VERILOG_FILE",
    [LANGUAGE.SYSTEMVERILOG]: "SYSTEMVERILOG_FILE",
    [LANGUAGE.CPP]: "",
    [LANGUAGE.C]: "",
    [LANGUAGE.PYTHON]: "",
    [LANGUAGE.VERIBLELINTRULES]: "",
    [LANGUAGE.TCL]: "",
    [LANGUAGE.XDC]: "",
    [LANGUAGE.SDC]: "",
    [LANGUAGE.PIN]: "",
    [LANGUAGE.XCI]: "",
    [LANGUAGE.SBY]: "",
    [LANGUAGE.PRO]: "",
    [LANGUAGE.NONE]: "",
    [LANGUAGE.QIP]: "",
    [LANGUAGE.UCF]: ""
};

export class QuartusExecutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "QuartusExecutionError";
    }
}

/**
 * Execute Quartus tcl script.
 * @param config Configuration.
 * @param tcl_file Tcl file path.
 * @param args Arguments.
 * @param cwd Current working directory.
 * @returns Result of execution.
**/
async function executeQuartusTcl(config: e_config, tcl_file: string, args: string, cwd: string):
    Promise<{ result: p_result, csv_content: string }> {

    // Get Vivado binary path
    let quartus_bin = config.tools.quartus.installation_path;
    if (quartus_bin === "") {
        quartus_bin = "quartus_sh";
    }
    else {
        quartus_bin = path_lib.join(quartus_bin, "quartus_sh");
    }

    // Create temp file for out.csv
    const csv_file = process_utils.create_temp_file("");

    const cmd = `${quartus_bin} -t ${tcl_file} ${csv_file} ${args}`;
    const cmd_result = await (new process.Process(undefined)).exec_wait(cmd, { cwd: cwd });

    const csv_content = await file_utils.read_file_sync(csv_file);

    file_utils.remove_file(csv_file);

    return { result: cmd_result, csv_content: csv_content };
}

/**
 * Get Quartus project info.
 * @param config Configuration.
 * @param prj_path Path to Quartus project.
 * @returns Quartus project info.
**/
export async function getProjectInfo(config: e_config, prj_path: string)
    : Promise<{ name: string, currentRevision: string, topEntity: string, revisionList: string[] }> {

    const args = prj_path;
    const tcl_file = path_lib.join(__dirname, 'bin', 'project_info.tcl');

    const cmd_result = await executeQuartusTcl(config, tcl_file, args, "");

    const result = {
        prj_name: "",
        prj_revision: "",
        prj_top_entity: "",
        revision_list: [""],
    };

    if (!cmd_result.result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }

    try {
        const line_split = cmd_result.csv_content.trim().split(/\r\n|\n|\r/);
        if (line_split.length !== 2) {
            throw new QuartusExecutionError("Error in Quartus execution");
        }

        // General info
        const data_0 = line_split[0].split(',');
        if (data_0.length === 3) {
            result.prj_name = data_0[0].trim();
            result.prj_revision = data_0[1].trim();
            result.prj_top_entity = data_0[2].trim();
        } else {
            throw new QuartusExecutionError("Error in Quartus execution");
        }

        // Revision list
        const data_1 = line_split[1].split(',');
        const revision_list = data_1.map((s: string) => s.trim());
        result.revision_list = revision_list;

    } catch (error) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }

    const projectInfo = {
        name: result.prj_name,
        currentRevision: result.prj_revision,
        topEntity: result.prj_top_entity,
        revisionList: result.revision_list
    };
    return projectInfo;
}

/**
 * Get family and parts installed.
 * @param config Configuration.
 * @returns Quartus project info.
**/
export async function getFamilyAndParts(config: e_config): Promise<t_board_list[]> {
    const tcl_file = path_lib.join(__dirname, 'bin', 'get_boards.tcl');
    const args = "";

    const cmd_result = await executeQuartusTcl(config, tcl_file, args, "");
    if (!cmd_result.result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }

    const boardList: t_board_list[] = [];
    try {
        const board_list_str = cmd_result.csv_content.split(/\r\n|\n|\r/);
        for (const board_str of board_list_str) {
            const board_list = board_str.split(',');

            const family = board_list[0].trim();
            const part = board_list.slice(1).map((s: string) => s.trim());

            if (family === "") {
                continue;
            }
            boardList.push({
                family: family,
                part_list: part
            });
        }
    } catch (error) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
    return boardList;
}

/**
 * Get files from Quartus project.
 * @param config Configuration.
 * @param projectPath Path to Quartus project.
 * @param is_manual True if the files are added manually.
 * @returns Quartus project info.
**/
export async function getFilesFromProject(config: e_config, projectPath: string, is_manual: boolean):
    Promise<t_file[]> {

    const tcl_file = path_lib.join(__dirname, 'bin', 'get_files.tcl');
    const args = projectPath;

    const cmd_result = await executeQuartusTcl(config, tcl_file, args, "");

    if (!cmd_result.result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }

    // Create temp file csv
    const csv_file = process_utils.create_temp_file("");
    file_utils.save_file_sync(csv_file, cmd_result.csv_content);

    const result_csv = get_files_from_csv(csv_file, is_manual);

    // Delete temp file
    file_utils.remove_file(csv_file);

    return result_csv.file_list;
}

/**
 * Execute a list of commands in Quartus project.
 * @param config Configuration.
 * @param projectPath Path to Quartus project.
 * @param cmdList List of commands to execute.
**/
export async function executeCmdListQuartusProject(config: e_config, projectPath: string, cmdList: string[])
    : Promise<t_loader_action_result> {

    const templateContent = file_utils.read_file_sync(path_lib.join(__dirname, 'bin', 'cmd_exec.tcl.nj'));
    const templateRender = nunjucks.renderString(templateContent, { "cmd_list": cmdList });

    // Create temp file
    const tclFile = process_utils.create_temp_file(templateRender);
    const args = projectPath;

    const cmdResult = await executeQuartusTcl(config, tclFile, args, "");

    const result: t_loader_action_result = {
        successful: cmdResult.result.successful,
        msg: cmdResult.result.stderr + cmdResult.result.stdout
    };

    // Delete temp file
    file_utils.remove_file(tclFile);

    return result;
}

/**
 * Add files to Quartus project.
 * @param config Configuration.
 * @param projectPath Path to Quartus project.
 * @param fileList List of files to add.
**/
export async function addFilesToProject(config: e_config, projectPath: string, fileList: t_file[]): Promise<void> {

    const cmd_list: string[] = [];
    for (const file of fileList) {
        let cmd = `set_global_assignment -name ${LANGUAGE_MAP[file.file_type]} ${file.name}`;
        if (file.logical_name !== "") {
            cmd += ` -library ${file.logical_name}`;
        }
        cmd_list.push(cmd);
    }

    const result = await executeCmdListQuartusProject(config, projectPath, cmd_list);
    if (!result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
}

/**
 * Remove files from Quartus project.
 * @param config Configuration.
 * @param projectPath Path to Quartus project.
 * @param fileList List of files to add.
**/
export async function removeFilesFromProject(config: e_config, projectPath: string, fileList: t_file[]): Promise<void> {
    const cmd_list: string[] = [];
    for (const file of fileList) {
        let cmd = `set_global_assignment -remove -name ${LANGUAGE_MAP[file.file_type]} ${file.name}`;
        if (file.logical_name !== "") {
            cmd += ` -library ${file.logical_name}`;
        }
        cmd_list.push(cmd);

        const fileRelative = file_utils.get_relative_path(file.name, projectPath);
        cmd = `set_global_assignment -remove -name ${LANGUAGE_MAP[file.file_type]} ${fileRelative}`;
        if (file.logical_name !== "") {
            cmd += ` -library ${file.logical_name}`;
        }
        cmd_list.push(cmd);
    }

    const result = await executeCmdListQuartusProject(config, projectPath, cmd_list);
    if (!result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
}

/**
 * Create a new Quartus project.
 * @param config Configuration.
 * @param projectDirectory Directory where the project will be created.
 * @param name Project name.
 * @returns Quartus project info.
**/
export async function createProject(config: e_config, projectDirectory: string, name: string,
    family: string, part: string): Promise<void> {

    const tcl_file = path_lib.join(__dirname, 'bin', 'create_project.tcl');
    const args = `"${name}" "${family}" "${part}"`;

    const cmd_result = await executeQuartusTcl(config, tcl_file, args, projectDirectory);
    if (!cmd_result.result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
}

/**
 * Clean Quartus project.
 * @param config Configuration.
 * @param projectPath Path to Quartus project.
**/
export async function cleanProject(config: e_config, projectPath: string): Promise<void> {
    const cmd = "project_clean";
    const result = await executeCmdListQuartusProject(config, projectPath, [cmd]);
    if (!result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
}

/**
 * Set top level path in Quartus project.
 * @param config Configuration.
 * @param projectPath Path to Quartus project.
 * @param topLevelPath Top level path.
**/
export async function setTopLevelPath(config: e_config, projectPath: string, topLevelPath: string): Promise<void> {
    const entityName = get_toplevel_from_path(topLevelPath);
    const cmd = `set_global_assignment -name TOP_LEVEL_ENTITY ${entityName}`;
    if (entityName === "") {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
    const result = await executeCmdListQuartusProject(config, projectPath, [cmd]);
    if (!result.successful) {
        throw new QuartusExecutionError("Error in Quartus execution");
    }
}