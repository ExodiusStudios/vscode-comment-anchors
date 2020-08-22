import { TreeDataProvider, Event, TreeItem, workspace, Uri } from "vscode";
import EntryAnchor from "../anchor/entryAnchor";
import { AnchorEngine, AnyEntry, AnyEntryArray } from "../anchorEngine";
import EntryCachedFile from "../anchor/entryCachedFile";
import { AnchorIndex } from "../anchorIndex";

/**
 * AnchorProvider implementation in charge of returning the anchors in the current workspace
 */
export class WorkspaceAnchorProvider implements TreeDataProvider<AnyEntry> {
  readonly provider: AnchorEngine;
  readonly onDidChangeTreeData: Event<undefined>;

  constructor(provider: AnchorEngine) {
    this.onDidChangeTreeData = provider._onDidChangeTreeData.event;
    this.provider = provider;
  }

  getTreeItem(element: AnyEntry): TreeItem {
    return element;
  }

  getChildren(element?: AnyEntry): Thenable<AnyEntryArray> {
    return new Promise((success) => {
      if (element) {
        if (element instanceof EntryAnchor && element.children) {
          success(element.children);
          return;
        } else if (element instanceof EntryCachedFile) {
          const res: EntryAnchor[] = [];

          const cachedFile = element as EntryCachedFile;

          if (this.provider._config!.tags.displayHierarchyInWorkspace) {
            cachedFile.anchors.forEach((anchor: EntryAnchor) => {
              if (!anchor.isVisibleInWorkspace) return;

              res.push(anchor.copy(true));
            });
          } else {
            WorkspaceAnchorProvider.flattenAnchors(cachedFile.anchors).forEach(
              (anchor: EntryAnchor) => {
                if (!anchor.isVisibleInWorkspace) return;

                res.push(anchor.copy(false));
              }
            );
          }

          success(EntryAnchor.sortAnchors(res));
        } else {
          success([]);
        }

        return;
      }

      if (!this.provider._config!.workspace.enabled) {
        success([this.provider.errorWorkspaceDisabled]);
        return;
      } else if (!workspace.workspaceFolders) {
        success([this.provider.errorFileOnly]);
        return;
      } else if (
        this.provider._config!.workspace.lazyLoad &&
        !this.provider.anchorsScanned
      ) {
        success([this.provider.statusScan]);
      } else if (!this.provider.anchorsLoaded) {
        success([this.provider.statusLoading]);
        return;
      }

      const format = this.provider._config!.workspace.pathFormat;
      const res: EntryCachedFile[] = [];

      this.provider.anchorMaps.forEach((index: AnchorIndex, document: Uri) => {
        const anchors = index.anchorTree;

        if (anchors.length == 0) return; // Skip empty files

        let notVisible = true;

        anchors.forEach((anchor) => {
          if (anchor.isVisibleInWorkspace) notVisible = false;
        });

        if (!notVisible) {
          try {
            res.push(
              new EntryCachedFile(this.provider, document, anchors, format)
            );
          } catch (err) {
            // Simply ignore, we do not want to push this file
          }
        }
      });

      if (res.length == 0) {
        success([this.provider.errorEmptyWorkspace]);
        return;
      }

      success(
        res.sort((left, right) => {
          return left.label!.localeCompare(right.label!);
        })
      );
    });
  }

  /**
   * Flattens hierarchical anchors into a single array
   *
   * @param anchors Array to flatten
   */
  static flattenAnchors(anchors: EntryAnchor[]): EntryAnchor[] {
    const list: EntryAnchor[] = [];

    function crawlList(anchors: EntryAnchor[]) {
      anchors.forEach((anchor) => {
        list.push(anchor);

        crawlList(anchor.children);
      });
    }

    crawlList(anchors);

    return list;
  }
}
