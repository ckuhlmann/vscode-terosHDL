// Copyright 2023
// Carlos Alberto Ruiz Naranjo [carlosruiznaranjo@gmail.com]
// Ismael Perez Rojo [ismaelprojo@gmail.com]
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

import { t_Multi_project_manager } from '../../../type_declaration';
import * as vscode from "vscode";
import { get_icon } from "../utils";
import * as teroshdl2 from 'teroshdl2';
import { ThemeColor } from 'vscode';


export const VIEW_ID = "teroshdl-project";
const URISTRINGINIT = "teroshdl:/";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Elements
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export class Project extends vscode.TreeItem {
    public children: any[] | undefined;
    public iconPath = get_icon("folder");
    public contextValue = "project";
    // Element
    private project_name: string;

    constructor(projectType: teroshdl2.project_manager.common.e_project_type, project_name: string,
        label: string, isOpen: boolean, children?: any[]) {

        super(
            label,
            children === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded
        );
        // Common
        this.children = children;
        // Element
        this.project_name = project_name;
        this.tooltip = "";
        // Command
        this.command = {
            command: "teroshdl.view.project.select",
            title: "Select project",
            arguments: [this],
        };


        let iconName = "folder";
        this.description = "Generic Project";
        if (projectType === teroshdl2.project_manager.common.e_project_type.QUARTUS) {
            this.description = "Quartus Project";
            iconName = "quartus";
        }
        else if (projectType === teroshdl2.project_manager.common.e_project_type.SANDPIPER) {
            this.description = "TL-Verilog Project";
        }
        
        if (isOpen) {
            this.resourceUri = vscode.Uri.parse(`${URISTRINGINIT}project-active`);
            iconName += "-active";
        }
        this.iconPath = get_icon(iconName);
    }

    public get_project_name(): string {
        return this.project_name;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Providers
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export abstract class BaseTreeDataProvider<T> implements vscode.TreeDataProvider<T> {
    static getViewID(): string {
        throw new Error('Not implemented.');
    }

    abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;
    abstract getChildren(element?: T | undefined): vscode.ProviderResult<T[]>;
}

export class ProjectProvider extends BaseTreeDataProvider<TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    data: TreeItem[] = [];
    private project_manager: t_Multi_project_manager;

    constructor(project_manager: t_Multi_project_manager) {
        super();
        this.project_manager = project_manager;
    }

    getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: TreeItem | undefined): vscode.ProviderResult<TreeItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }

    static getViewID() {
        return VIEW_ID;
    }

    refresh(): void {
        const prj_view: Project[] = [];

        const project_list = this.project_manager.get_projects();
        let selected_project_name = '';
        try {
            selected_project_name = this.project_manager.get_selected_project().get_name();
        } catch (error) {
        }
        project_list.forEach(prj => {
            const prj_name = prj.get_name();
            let label = prj.get_name();
            let isOpen = false;
            if (selected_project_name === prj_name) {
                isOpen = true;
            }

            const prjType = prj.getProjectType();
            prj_view.push(new Project(prjType, prj.get_name(), prj_name, isOpen));
        });
        this.data = prj_view;
        this._onDidChangeTreeData.fire();
    }
}

export class TreeItem extends vscode.TreeItem {
    children: TreeItem[] | undefined;

    constructor(label: string, children?: TreeItem[]) {
        super(
            label,
            children === undefined ? vscode.TreeItemCollapsibleState.None :
                vscode.TreeItemCollapsibleState.Expanded);
        this.children = children;
    }
}

export class ProjectDecorator implements vscode.FileDecorationProvider {
    onDidChangeFileDecorations?: vscode.Event<vscode.Uri | vscode.Uri[]>;
    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        if (uri.path.includes("project-active") && uri.scheme === "teroshdl") {
            return {
                color: new ThemeColor("charts.green"),
            };
        }
    }
}