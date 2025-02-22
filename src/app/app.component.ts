import { CommonModule, DatePipe } from '@angular/common';
import { Component, TemplateRef, QueryList, ViewChildren, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgbCarousel, NgbCarouselConfig, NgbCarouselModule, NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import * as openpgp from 'openpgp';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { NgbdSortableHeader, SortEvent } from './sortable.directive';
import { FormsModule } from '@angular/forms';
import { NgbHighlight, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { LoginService } from './login.service';

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

  addLogin(content: TemplateRef<any>) {
    this.offcanvasService.open(content, { position: 'bottom' });
  }

  selectSource(selectedSource: string) {
    this.fileTypes = this.sourceOptionMap.get(selectedSource) || [];
    this.selectedFileType = '';
  }

  selectFileType(selectedFileType: string) {
    this.selectedFileType = selectedFileType;
  }

  async fileChange(event: any) {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.pgp')) {
      const reader = new FileReader();
      reader.onload = async (e: any) => {
        const encryptedData = e.target.result;

        const message = await openpgp.readMessage({
          armoredMessage: encryptedData
        });
        try {
          const { data: decrypted } = await openpgp.decrypt({
            message,
            passwords: [this.password],
            format: 'binary'
          });

          const decoder = new TextDecoder();
          const decryptedText = decoder.decode(decrypted);
          // there's some prepended and appended data that needs to be removed
          const start = decryptedText.indexOf('{');
          const end = decryptedText.lastIndexOf('"}');
          const trimmedData = decryptedText.substring(start, end + 2);
          const jsonData = JSON.parse(trimmedData);
          console.log(jsonData);
          this.processLoginData(jsonData);
          this.offcanvasService.dismiss();
        } catch (e) {
          this.offcanvasService.dismiss();
          console.error(e);
          return;
        }
      };
      reader.readAsText(file);
    }
  }

  private processLoginData(data: any) {
    // Process the JSON data as needed
    const logins: ILogin[] = [];
    for (const vault in data.vaults) {
      const vaultData = data.vaults[vault];
      const vaultName = vaultData.name;
      for (const login in vaultData.items) {
        const loginData = vaultData.items[login];
        if (loginData.data.type === 'login') {
          const loginInfo = {
            name: loginData.data.metadata.name || loginData.data.itemId,
            username: loginData.data.content.itemEmail || loginData.data.content.itemUsername,
            password: loginData.data.content.password,
            urls: loginData.data.content.urls,
            note: loginData.data.metadata.note,
            vault: vaultName,
            createTime: new Date(loginData.createTime * 1000),
            modifyTime: new Date(loginData.modifyTime * 1000)
          } as ILogin;
          logins.push(new Login(loginInfo));
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

export class Login implements ILogin {
  name: string;
  username: string;
  password: string;
  urls: string[];
  note: string;
  vault: string;
  createTime: Date;
  modifyTime: Date;

  constructor(data: ILogin) {
    this.name = data.name;
    this.username = data.username;
    this.password = data.password;
    this.urls = data.urls;
    this.note = data.note;
    this.vault = data.vault;
    this.createTime = data.createTime;
    this.modifyTime = data.modifyTime;
  }
}
