/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IDataSource, ITreeNode, ITreeRenderer, ITreeSorter, ITreeFilter } from 'vs/base/browser/ui/tree/tree';
import { values } from 'vs/base/common/collections';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import 'vs/css!./media/outlineTree';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { SymbolKind, SymbolKinds, SymbolTag } from 'vs/editor/common/modes';
import { OutlineElement, OutlineGroup, OutlineModel } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineConfigKeys } from 'vs/editor/contrib/documentSymbols/outline';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { registerColor, listErrorForeground, listWarningForeground, foreground } from 'vs/platform/theme/common/colorRegistry';
import { IdleValue } from 'vs/base/common/async';

export type OutlineItem = OutlineGroup | OutlineElement;

export class OutlineNavigationLabelProvider implements IKeyboardNavigationLabelProvider<OutlineItem> {

	getKeyboardNavigationLabel(element: OutlineItem): { toString(): string; } {
		if (element instanceof OutlineGroup) {
			return element.provider.displayName || element.id;
		} else {
			return element.symbol.name;
		}
	}
}


export class OutlineIdentityProvider implements IIdentityProvider<OutlineItem> {
	getId(element: OutlineItem): { toString(): string; } {
		return element.id;
	}
}

export class OutlineGroupTemplate {
	static readonly id = 'OutlineGroupTemplate';
	constructor(
		readonly labelContainer: HTMLElement,
		readonly label: HighlightedLabel,
	) { }
}

export class OutlineElementTemplate {
	static readonly id = 'OutlineElementTemplate';
	constructor(
		readonly container: HTMLElement,
		readonly iconLabel: IconLabel,
		readonly iconClass: HTMLElement,
		readonly decoration: HTMLElement,
	) { }
}

export class OutlineVirtualDelegate implements IListVirtualDelegate<OutlineItem> {

	getHeight(_element: OutlineItem): number {
		return 22;
	}

	getTemplateId(element: OutlineItem): string {
		if (element instanceof OutlineGroup) {
			return OutlineGroupTemplate.id;
		} else {
			return OutlineElementTemplate.id;
		}
	}
}

export class OutlineGroupRenderer implements ITreeRenderer<OutlineGroup, FuzzyScore, OutlineGroupTemplate> {

	readonly templateId: string = OutlineGroupTemplate.id;

	renderTemplate(container: HTMLElement): OutlineGroupTemplate {
		const labelContainer = dom.$('.outline-element-label');
		dom.addClass(container, 'outline-element');
		dom.append(container, labelContainer);
		return new OutlineGroupTemplate(labelContainer, new HighlightedLabel(labelContainer, true));
	}

	renderElement(node: ITreeNode<OutlineGroup, FuzzyScore>, index: number, template: OutlineGroupTemplate): void {
		template.label.set(
			node.element.provider.displayName || localize('provider', "Outline Provider"),
			createMatches(node.filterData)
		);
	}

	disposeTemplate(_template: OutlineGroupTemplate): void {
		// nothing
	}
}

export class OutlineElementRenderer implements ITreeRenderer<OutlineElement, FuzzyScore, OutlineElementTemplate> {

	readonly templateId: string = OutlineElementTemplate.id;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	renderTemplate(container: HTMLElement): OutlineElementTemplate {
		dom.addClass(container, 'outline-element');
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const iconClass = dom.$('.outline-element-icon');
		const decoration = dom.$('.outline-element-decoration');
		container.prepend(iconClass);
		container.appendChild(decoration);
		return new OutlineElementTemplate(container, iconLabel, iconClass, decoration);
	}

	renderElement(node: ITreeNode<OutlineElement, FuzzyScore>, index: number, template: OutlineElementTemplate): void {
		const { element } = node;
		const options = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
			extraClasses: <string[]>[],
			title: localize('title.template', "{0} ({1})", element.symbol.name, OutlineElementRenderer._symbolKindNames[element.symbol.kind])
		};
		if (this._configurationService.getValue(OutlineConfigKeys.icons)) {
			// add styles for the icons
			template.iconClass.className = '';
			dom.addClasses(template.iconClass, `outline-element-icon ${SymbolKinds.toCssClassName(element.symbol.kind, true)}`);
		}
		if (element.symbol.tags.indexOf(SymbolTag.Deprecated) >= 0) {
			options.extraClasses.push(`deprecated`);
			options.matches = [];
		}
		template.iconLabel.setLabel(element.symbol.name, element.symbol.detail, options);
		this._renderMarkerInfo(element, template);
	}

	private _renderMarkerInfo(element: OutlineElement, template: OutlineElementTemplate): void {

		if (!element.marker) {
			dom.hide(template.decoration);
			template.container.style.removeProperty('--outline-element-color');
			return;
		}

		const { count, topSev } = element.marker;
		const color = this._themeService.getTheme().getColor(topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
		const cssColor = color ? color.toString() : 'inherit';

		// color of the label
		if (this._configurationService.getValue(OutlineConfigKeys.problemsColors)) {
			template.container.style.setProperty('--outline-element-color', cssColor);
		} else {
			template.container.style.removeProperty('--outline-element-color');
		}

		// badge with color/rollup
		if (!this._configurationService.getValue(OutlineConfigKeys.problemsBadges)) {
			dom.hide(template.decoration);

		} else if (count > 0) {
			dom.show(template.decoration);
			dom.removeClass(template.decoration, 'bubble');
			template.decoration.innerText = count < 10 ? count.toString() : '+9';
			template.decoration.title = count === 1 ? localize('1.problem', "1 problem in this element") : localize('N.problem', "{0} problems in this element", count);
			template.decoration.style.setProperty('--outline-element-color', cssColor);

		} else {
			dom.show(template.decoration);
			dom.addClass(template.decoration, 'bubble');
			template.decoration.innerText = '\uea71';
			template.decoration.title = localize('deep.problem', "Contains elements with problems");
			template.decoration.style.setProperty('--outline-element-color', cssColor);
		}
	}

	private static _symbolKindNames: { [symbol: number]: string } = {
		[SymbolKind.Array]: localize('Array', "array"),
		[SymbolKind.Boolean]: localize('Boolean', "boolean"),
		[SymbolKind.Class]: localize('Class', "class"),
		[SymbolKind.Constant]: localize('Constant', "constant"),
		[SymbolKind.Constructor]: localize('Constructor', "constructor"),
		[SymbolKind.Enum]: localize('Enum', "enumeration"),
		[SymbolKind.EnumMember]: localize('EnumMember', "enumeration member"),
		[SymbolKind.Event]: localize('Event', "event"),
		[SymbolKind.Field]: localize('Field', "field"),
		[SymbolKind.File]: localize('File', "file"),
		[SymbolKind.Function]: localize('Function', "function"),
		[SymbolKind.Interface]: localize('Interface', "interface"),
		[SymbolKind.Key]: localize('Key', "key"),
		[SymbolKind.Method]: localize('Method', "method"),
		[SymbolKind.Module]: localize('Module', "module"),
		[SymbolKind.Namespace]: localize('Namespace', "namespace"),
		[SymbolKind.Null]: localize('Null', "null"),
		[SymbolKind.Number]: localize('Number', "number"),
		[SymbolKind.Object]: localize('Object', "object"),
		[SymbolKind.Operator]: localize('Operator', "operator"),
		[SymbolKind.Package]: localize('Package', "package"),
		[SymbolKind.Property]: localize('Property', "property"),
		[SymbolKind.String]: localize('String', "string"),
		[SymbolKind.Struct]: localize('Struct', "struct"),
		[SymbolKind.TypeParameter]: localize('TypeParameter', "type parameter"),
		[SymbolKind.Variable]: localize('Variable', "variable"),
	};

	disposeTemplate(_template: OutlineElementTemplate): void {
		_template.iconLabel.dispose();
	}
}

export const enum OutlineSortOrder {
	ByPosition,
	ByName,
	ByKind
}

export class OutlineFilter implements ITreeFilter<OutlineItem> {

	private readonly _filteredTypes = new Set<SymbolKind>();

	constructor(
		private readonly _prefix: string,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {

	}

	update() {
		this._filteredTypes.clear();
		for (const name of SymbolKinds.names()) {
			if (!this._configService.getValue<boolean>(`${this._prefix}.${name}`)) {
				this._filteredTypes.add(SymbolKinds.fromString(name) || -1);
			}
		}
	}

	filter(element: OutlineItem): boolean {
		return !(element instanceof OutlineElement) || !this._filteredTypes.has(element.symbol.kind);
	}
}

export class OutlineItemComparator implements ITreeSorter<OutlineItem> {

	private readonly _collator = new IdleValue<Intl.Collator>(() => new Intl.Collator(undefined, { numeric: true }));

	constructor(
		public type: OutlineSortOrder = OutlineSortOrder.ByPosition
	) { }

	compare(a: OutlineItem, b: OutlineItem): number {
		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.providerIndex - b.providerIndex;

		} else if (a instanceof OutlineElement && b instanceof OutlineElement) {
			if (this.type === OutlineSortOrder.ByKind) {
				return a.symbol.kind - b.symbol.kind || this._collator.getValue().compare(a.symbol.name, b.symbol.name);
			} else if (this.type === OutlineSortOrder.ByName) {
				return this._collator.getValue().compare(a.symbol.name, b.symbol.name) || Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range);
			} else if (this.type === OutlineSortOrder.ByPosition) {
				return Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range) || this._collator.getValue().compare(a.symbol.name, b.symbol.name);
			}
		}
		return 0;
	}
}

export class OutlineDataSource implements IDataSource<OutlineModel, OutlineItem> {

	getChildren(element: undefined | OutlineModel | OutlineGroup | OutlineElement): OutlineItem[] {
		if (!element) {
			return [];
		}
		return values(element.children);
	}
}

export const SYMBOL_ICON_ARRAY_FOREGROUND = registerColor('symbolIcon.arrayForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.arrayForeground', 'The foreground color for array symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_BOOLEAN_FOREGROUND = registerColor('symbolIcon.booleanForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.booleanForeground', 'The foreground color for boolean symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CLASS_FOREGROUND = registerColor('symbolIcon.classForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('symbolIcon.classForeground', 'The foreground color for class symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_COLOR_FOREGROUND = registerColor('symbolIcon.colorForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.colorForeground', 'The foreground color for color symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CONSTANT_FOREGROUND = registerColor('symbolIcon.contstantForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.contstantForeground', 'The foreground color for contstant symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CONSTRUCTOR_FOREGROUND = registerColor('symbolIcon.constructorForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('symbolIcon.constructorForeground', 'The foreground color for constructor symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_ENUMERATOR_FOREGROUND = registerColor('symbolIcon.enumeratorForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('symbolIcon.enumeratorForeground', 'The foreground color for enumerator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND = registerColor('symbolIcon.enumeratorMemberForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.enumeratorMemberForeground', 'The foreground color for enumerator member symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_EVENT_FOREGROUND = registerColor('symbolIcon.eventForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('symbolIcon.eventForeground', 'The foreground color for event symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FIELD_FOREGROUND = registerColor('symbolIcon.fieldForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.fieldForeground', 'The foreground color for field symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FILE_FOREGROUND = registerColor('symbolIcon.fileForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.fileForeground', 'The foreground color for file symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FOLDER_FOREGROUND = registerColor('symbolIcon.folderForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.folderForeground', 'The foreground color for folder symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FUNCTION_FOREGROUND = registerColor('symbolIcon.functionForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('symbolIcon.functionForeground', 'The foreground color for function symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_INTERFACE_FOREGROUND = registerColor('symbolIcon.interfaceForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.interfaceForeground', 'The foreground color for interface symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_KEY_FOREGROUND = registerColor('symbolIcon.keyForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.keyForeground', 'The foreground color for key symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_KEYWORD_FOREGROUND = registerColor('symbolIcon.keywordForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.keywordForeground', 'The foreground color for keyword symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_METHOD_FOREGROUND = registerColor('symbolIcon.methodForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('symbolIcon.methodForeground', 'The foreground color for method symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_MODULE_FOREGROUND = registerColor('symbolIcon.moduleForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.moduleForeground', 'The foreground color for module symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NAMESPACE_FOREGROUND = registerColor('symbolIcon.namespaceForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.namespaceForeground', 'The foreground color for namespace symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NULL_FOREGROUND = registerColor('symbolIcon.nullForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.nullForeground', 'The foreground color for null symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NUMBER_FOREGROUND = registerColor('symbolIcon.numberForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.numberForeground', 'The foreground color for number symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_OBJECT_FOREGROUND = registerColor('symbolIcon.objectForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.objectForeground', 'The foreground color for object symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_OPERATOR_FOREGROUND = registerColor('symbolIcon.operatorForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.operatorForeground', 'The foreground color for operator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_PACKAGE_FOREGROUND = registerColor('symbolIcon.packageForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.packageForeground', 'The foreground color for package symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_PROPERTY_FOREGROUND = registerColor('symbolIcon.propertyForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.propertyForeground', 'The foreground color for property symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_REFERENCE_FOREGROUND = registerColor('symbolIcon.referenceForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.referenceForeground', 'The foreground color for reference symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_SNIPPET_FOREGROUND = registerColor('symbolIcon.snippetForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.snippetForeground', 'The foreground color for snippet symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_STRING_FOREGROUND = registerColor('symbolIcon.stringForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.stringForeground', 'The foreground color for string symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_STRUCT_FOREGROUND = registerColor('symbolIcon.structForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.structForeground', 'The foreground color for struct symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_TEXT_FOREGROUND = registerColor('symbolIcon.textForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.textForeground', 'The foreground color for text symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_TYPEPARAMETER_FOREGROUND = registerColor('symbolIcon.typeParameterForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.typeParameterForeground', 'The foreground color for type parameter symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_UNIT_FOREGROUND = registerColor('symbolIcon.unitForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.unitForeground', 'The foreground color for unit symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_VARIABLE_FOREGROUND = registerColor('symbolIcon.variableForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.variableForeground', 'The foreground color for variable symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	const symbolIconArrayColor = theme.getColor(SYMBOL_ICON_ARRAY_FOREGROUND);
	if (symbolIconArrayColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-array {
				color: ${symbolIconArrayColor} !important;
			}
		`);
	}

	const symbolIconBooleanColor = theme.getColor(SYMBOL_ICON_BOOLEAN_FOREGROUND);
	if (symbolIconBooleanColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-boolean {
				color: ${symbolIconBooleanColor} !important;
			}
		`);
	}

	const symbolIconClassColor = theme.getColor(SYMBOL_ICON_CLASS_FOREGROUND);
	if (symbolIconClassColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-class {
				color: ${symbolIconClassColor} !important;
			}
		`);
	}

	const symbolIconMethodColor = theme.getColor(SYMBOL_ICON_METHOD_FOREGROUND);
	if (symbolIconMethodColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-method {
				color: ${symbolIconMethodColor} !important;
			}
		`);
	}

	const symbolIconColorColor = theme.getColor(SYMBOL_ICON_COLOR_FOREGROUND);
	if (symbolIconColorColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-color {
				color: ${symbolIconColorColor} !important;
			}
		`);
	}

	const symbolIconConstantColor = theme.getColor(SYMBOL_ICON_CONSTANT_FOREGROUND);
	if (symbolIconConstantColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-constant {
				color: ${symbolIconConstantColor} !important;
			}
		`);
	}

	const symbolIconConstructorColor = theme.getColor(SYMBOL_ICON_CONSTRUCTOR_FOREGROUND);
	if (symbolIconConstructorColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-constructor {
				color: ${symbolIconConstructorColor} !important;
			}
		`);
	}

	const symbolIconEnumeratorColor = theme.getColor(SYMBOL_ICON_ENUMERATOR_FOREGROUND);
	if (symbolIconEnumeratorColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-value,
			.monaco-workbench .codicon-symbol-enum {
				color: ${symbolIconEnumeratorColor} !important;
			}
		`);
	}

	const symbolIconEnumeratorMemberColor = theme.getColor(SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND);
	if (symbolIconEnumeratorMemberColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-enum-member {
				color: ${symbolIconEnumeratorMemberColor} !important;
			}
		`);
	}

	const symbolIconEventColor = theme.getColor(SYMBOL_ICON_EVENT_FOREGROUND);
	if (symbolIconEventColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-event {
				color: ${symbolIconEventColor} !important;
			}
		`);
	}

	const symbolIconFieldColor = theme.getColor(SYMBOL_ICON_FIELD_FOREGROUND);
	if (symbolIconFieldColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-field {
				color: ${symbolIconFieldColor} !important;
			}
		`);
	}

	const symbolIconFileColor = theme.getColor(SYMBOL_ICON_FILE_FOREGROUND);
	if (symbolIconFileColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-file {
				color: ${symbolIconFileColor} !important;
			}
		`);
	}

	const symbolIconFolderColor = theme.getColor(SYMBOL_ICON_FOLDER_FOREGROUND);
	if (symbolIconFolderColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-folder {
				color: ${symbolIconFolderColor} !important;
			}
		`);
	}

	const symbolIconFunctionColor = theme.getColor(SYMBOL_ICON_FUNCTION_FOREGROUND);
	if (symbolIconFunctionColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-function {
				color: ${symbolIconFunctionColor} !important;
			}
		`);
	}

	const symbolIconInterfaceColor = theme.getColor(SYMBOL_ICON_INTERFACE_FOREGROUND);
	if (symbolIconInterfaceColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-interface {
				color: ${symbolIconInterfaceColor} !important;
			}
		`);
	}

	const symbolIconKeyColor = theme.getColor(SYMBOL_ICON_KEY_FOREGROUND);
	if (symbolIconKeyColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-key {
				color: ${symbolIconKeyColor} !important;
			}
		`);
	}

	const symbolIconKeywordColor = theme.getColor(SYMBOL_ICON_KEYWORD_FOREGROUND);
	if (symbolIconKeywordColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-keyword {
				color: ${symbolIconKeywordColor} !important;
			}
		`);
	}

	const symbolIconModuleColor = theme.getColor(SYMBOL_ICON_MODULE_FOREGROUND);
	if (symbolIconModuleColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-module {
				color: ${symbolIconModuleColor} !important;
			}
		`);
	}

	const outlineNamespaceColor = theme.getColor(SYMBOL_ICON_NAMESPACE_FOREGROUND);
	if (outlineNamespaceColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-namespace {
				color: ${outlineNamespaceColor} !important;
			}
		`);
	}

	const symbolIconNullColor = theme.getColor(SYMBOL_ICON_NULL_FOREGROUND);
	if (symbolIconNullColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-null {
				color: ${symbolIconNullColor} !important;
			}
		`);
	}

	const symbolIconNumberColor = theme.getColor(SYMBOL_ICON_NUMBER_FOREGROUND);
	if (symbolIconNumberColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-number {
				color: ${symbolIconNumberColor} !important;
			}
		`);
	}

	const symbolIconObjectColor = theme.getColor(SYMBOL_ICON_OBJECT_FOREGROUND);
	if (symbolIconObjectColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-object {
				color: ${symbolIconObjectColor} !important;
			}
		`);
	}

	const symbolIconOperatorColor = theme.getColor(SYMBOL_ICON_OPERATOR_FOREGROUND);
	if (symbolIconOperatorColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-operator {
				color: ${symbolIconOperatorColor} !important;
			}
		`);
	}

	const symbolIconPackageColor = theme.getColor(SYMBOL_ICON_PACKAGE_FOREGROUND);
	if (symbolIconPackageColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-package {
				color: ${symbolIconPackageColor} !important;
			}
		`);
	}

	const symbolIconPropertyColor = theme.getColor(SYMBOL_ICON_PROPERTY_FOREGROUND);
	if (symbolIconPropertyColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-property {
				color: ${symbolIconPropertyColor} !important;
			}
		`);
	}

	const symbolIconReferenceColor = theme.getColor(SYMBOL_ICON_REFERENCE_FOREGROUND);
	if (symbolIconReferenceColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-reference {
				color: ${symbolIconReferenceColor} !important;
			}
		`);
	}

	const symbolIconSnippetColor = theme.getColor(SYMBOL_ICON_SNIPPET_FOREGROUND);
	if (symbolIconSnippetColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-snippet {
				color: ${symbolIconSnippetColor} !important;
			}
		`);
	}

	const symbolIconStringColor = theme.getColor(SYMBOL_ICON_STRING_FOREGROUND);
	if (symbolIconStringColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-string {
				color: ${symbolIconStringColor} !important;
			}
		`);
	}

	const symbolIconStructColor = theme.getColor(SYMBOL_ICON_STRUCT_FOREGROUND);
	if (symbolIconStructColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-struct {
				color: ${symbolIconStructColor} !important;
			}
		`);
	}

	const symbolIconTextColor = theme.getColor(SYMBOL_ICON_TEXT_FOREGROUND);
	if (symbolIconTextColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-text {
				color: ${symbolIconTextColor} !important;
			}
		`);
	}

	const symbolIconTypeParameterColor = theme.getColor(SYMBOL_ICON_TYPEPARAMETER_FOREGROUND);
	if (symbolIconTypeParameterColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-type-parameter {
				color: ${symbolIconTypeParameterColor} !important;
			}
		`);
	}

	const symbolIconUnitColor = theme.getColor(SYMBOL_ICON_UNIT_FOREGROUND);
	if (symbolIconUnitColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-unit {
				color: ${symbolIconUnitColor} !important;
			}
		`);
	}

	const symbolIconVariableColor = theme.getColor(SYMBOL_ICON_VARIABLE_FOREGROUND);
	if (symbolIconVariableColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-variable {
				color: ${symbolIconVariableColor} !important;
			}
		`);
	}

});
