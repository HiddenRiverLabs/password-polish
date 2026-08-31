import { CommonModule, DatePipe, AsyncPipe } from '@angular/common';
import { Component, TemplateRef, QueryList, ViewChildren, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgbCarousel, NgbCarouselConfig, NgbCarouselModule, NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import * as openpgp from 'openpgp';
import { Observable } from 'rxjs';
import { NgbdSortableHeader, SortEvent } from './sortable.directive';
import { FormsModule } from '@angular/forms';
import { NgbHighlight, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { LoginService } from './login.service';

interface ProtonPassItem {
  createTime: number;
  modifyTime: number;
  data: {
    type: string;
    itemId: string;
    metadata: { name: string; note: string };
    content: {
      itemEmail: string;
      itemUsername: string;
      password: string;
      urls: string[];
    };
  };
}

interface ProtonPassVault {
  name: string;
  items: ProtonPassItem[];
}

interface ProtonPassExport {
  vaults: { [key: string]: ProtonPassVault };
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule, AsyncPipe, NgbHighlight, NgbdSortableHeader, NgbPaginationModule, NgbCarouselModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  providers: [LoginService, DatePipe, NgbCarouselConfig]
})
export class AppComponent {
  logins$: Observable<ILogin[]>;
  total$: Observable<number>;
  sourceOptions = ['ProtonPass'];
  fileTypes: string[] = [];
  selectedSource = '';
  selectedFileType = '';
  sourceOptionMap: Map<string, string[]> = new Map([
    ['ProtonPass', ['PGP', 'JSON', 'CSV']]
  ]);
  password = '';

  @ViewChildren(NgbdSortableHeader) headers!: QueryList<NgbdSortableHeader>;
  @ViewChild('carousel', { static: true }) carousel!: NgbCarousel;

  constructor(public service: LoginService,
    public config: NgbCarouselConfig,
    private offcanvasService: NgbOffcanvas,
  ) {
    this.logins$ = service.logins$;
    this.total$ = service.total$;
    config.showNavigationArrows = false;
    config.showNavigationIndicators = false;
    config.wrap = false;
    config.interval = 0;
  }

  onSort({ column, direction }: SortEvent) {
    // resetting other headers
    this.headers.forEach((header) => {
      if (header.sortable !== column) {
        header.direction = '';
      }
    });

    this.service.sortColumn = column;
    this.service.sortDirection = direction;
  }

  addLogin(content: TemplateRef<unknown>) {
    this.offcanvasService.open(content, { position: 'bottom' });
  }

  selectSource(selectedSource: string) {
    this.fileTypes = this.sourceOptionMap.get(selectedSource) || [];
    this.selectedFileType = '';
  }

  selectFileType(selectedFileType: string) {
    this.selectedFileType = selectedFileType;
  }

  async fileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && file.name.endsWith('.pgp')) {
      try {
        const encryptedData = await this.readFileAsText(file);
        const message = await openpgp.readMessage({ armoredMessage: encryptedData });
        const { data: decrypted } = await openpgp.decrypt({
          message,
          passwords: [this.password],
          format: 'binary'
        });
        this.password = '';

        const decoder = new TextDecoder();
        const decryptedText = decoder.decode(decrypted);
        // there's some prepended and appended data that needs to be removed
        const start = decryptedText.indexOf('{');
        const end = decryptedText.lastIndexOf('"}');
        const trimmedData = decryptedText.substring(start, end + 2);

        let jsonData: unknown;
        try {
          jsonData = JSON.parse(trimmedData);
        } catch {
          throw new Error('Failed to parse decrypted data as JSON');
        }

        if (!this.isProtonPassExport(jsonData)) {
          throw new Error('Unexpected data format');
        }

        this.processLoginData(jsonData);
        this.offcanvasService.dismiss();
      } catch (e) {
        this.password = '';
        this.offcanvasService.dismiss();
        console.error(e);
      }
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsText(file);
    });
  }

  private isProtonPassExport(data: unknown): data is ProtonPassExport {
    return (
      typeof data === 'object' &&
      data !== null &&
      'vaults' in data &&
      typeof (data as ProtonPassExport).vaults === 'object'
    );
  }

  private processLoginData(data: ProtonPassExport) {
    const logins: ILogin[] = [];
    for (const [, vaultData] of Object.entries(data.vaults)) {
      const vaultName = vaultData.name;
      for (const loginData of Object.values(vaultData.items)) {
        if (loginData.data.type === 'login') {
          const loginInfo: ILogin = {
            name: loginData.data.metadata.name || loginData.data.itemId,
            username: loginData.data.content.itemEmail || loginData.data.content.itemUsername,
            password: loginData.data.content.password,
            urls: loginData.data.content.urls,
            note: loginData.data.metadata.note,
            vault: vaultName,
            createTime: new Date(loginData.createTime * 1000),
            modifyTime: new Date(loginData.modifyTime * 1000)
          };
          logins.push(loginInfo);
        }
      }
    }
    this.service.logins = logins;
  }
}

export type ILogin = {
  name: string;
  username: string;
  password: string;
  urls: string[];
  note: string;
  vault: string;
  createTime: Date;
  modifyTime: Date;
};
