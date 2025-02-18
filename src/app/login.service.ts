import { Injectable } from '@angular/core';

import { BehaviorSubject, Observable, of, Subject } from 'rxjs';

import { DatePipe } from '@angular/common';
import { debounceTime, delay, switchMap, tap } from 'rxjs/operators';
import { ILogin } from './app.component';
import { SortColumn, SortDirection } from './sortable.directive';

interface SearchResult {
  logins: ILogin[];
  total: number;
}

interface State {
  page: number;
  pageSize: number;
  searchTerm: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
}

const compare = (v1: string | number | Date | string[], v2: string | number | Date | string[]) => {
  if (v1 instanceof Date && v2 instanceof Date) {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }
  if (typeof v1 !== 'object' && typeof v2 !== 'object') {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  } else {
    return v1.toString().toLowerCase() < v2.toString().toLowerCase() ? -1 : v1.toString().toLowerCase() > v2.toString().toLowerCase() ? 1 : 0;
  }
};

function sort(logins: ILogin[], column: SortColumn, direction: string): ILogin[] {
  if (direction === '' || column === '') {
    return logins;
  } else {
    return [...logins].sort((a, b) => {
      const res = compare(a[column], b[column]);
      return direction === 'asc' ? res : -res;
    });
  }
}

function matches(login: ILogin, term: string, pipe: DatePipe) {
  return (
    login.name?.toLowerCase().includes(term.toLowerCase()) ||
    login.username?.toLowerCase().includes(term.toLowerCase()) ||
    login.password?.toLowerCase().includes(term.toLowerCase()) ||
    (!login.password && term === '---') ||
    pipe.transform(login.modifyTime, 'short')?.includes(term) ||
    login.urls.toString().includes(term.toLowerCase())
  );
}

@Injectable({ providedIn: 'root' })
export class LoginService {
  private _loading$ = new BehaviorSubject<boolean>(true);
  private _search$ = new Subject<void>();
  private _logins$ = new BehaviorSubject<ILogin[]>([]);
  private _total$ = new BehaviorSubject<number>(0);
  private _logins: ILogin[] = [];

  private _state: State = {
    page: 1,
    pageSize: 25,
    searchTerm: '',
    sortColumn: '',
    sortDirection: '',
  };

  constructor(private pipe: DatePipe) {
    this._search$
      .pipe(
        tap(() => this._loading$.next(true)),
        debounceTime(200),
        switchMap(() => this._search()),
        delay(200),
        tap(() => this._loading$.next(false)),
      )
      .subscribe((result) => {
        this._logins$.next(result.logins);
        this._total$.next(result.total);
      });

    this._search$.next();
  }

  get logins$() {
    return this._logins$.asObservable();
  }
  get total$() {
    return this._total$.asObservable();
  }
  get loading$() {
    return this._loading$.asObservable();
  }
  get page() {
    return this._state.page;
  }
  get pageSize() {
    return this._state.pageSize;
  }
  get searchTerm() {
    return this._state.searchTerm;
  }

  set logins(logins: ILogin[]) {
    this._logins = logins;
    this._search$.next();
  }
  set page(page: number) {
    this._set({ page });
  }
  set pageSize(pageSize: number) {
    this._set({ pageSize });
  }
  set searchTerm(searchTerm: string) {
    this._set({ searchTerm });
  }
  set sortColumn(sortColumn: SortColumn) {
    this._set({ sortColumn });
  }
  set sortDirection(sortDirection: SortDirection) {
    this._set({ sortDirection });
  }

  private _set(patch: Partial<State>) {
    Object.assign(this._state, patch);
    this._search$.next();
  }

  private _search(): Observable<SearchResult> {
    const { sortColumn, sortDirection, pageSize, page, searchTerm } = this._state;

    // 1. sort
    let logins = sort(this._logins, sortColumn, sortDirection);

    // 2. filter
    logins = logins.filter((login: ILogin) => matches(login, searchTerm, this.pipe));
    const total = logins.length;

    // 3. paginate
    logins = logins.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    return of({ logins, total });
  }
}