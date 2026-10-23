import { FilterQuery, Query } from 'mongoose';

const MAX_PAGE_LIMIT = 500;
const DEFAULT_PAGE_LIMIT = 100;

// Recursively drop MongoDB operator keys ($..., dotted paths) from user input
// so values like ?media[$ne]=x cannot smuggle operators into queries.
const stripUnsafeOperators = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUnsafeOperators);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      sanitized[key] = stripUnsafeOperators(val);
    }
    return sanitized;
  }
  return value;
};

// Escape regex metacharacters so searchTerm cannot trigger ReDoS or
// unexpected pattern matches.
const escapeRegex = (term: string): string =>
  term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery;
    this.query = query;
  }

  // search method -1
  search(searchingFields: string[]) {
    const searchTerm = this.query?.searchTerm;

    if (searchTerm && typeof searchTerm === 'string') {
      const safeTerm = escapeRegex(searchTerm);
      // Applied via `.and()` (never a top-level `.find({$or})`) so the search
      // term composes with any `$or` already in the filter — e.g. the
      // privacy filter of the global feed — instead of clobbering it.
      this.modelQuery = this.modelQuery.and([
        {
          $or: searchingFields.map((field) => ({
            [field]: { $regex: safeTerm, $options: 'i' },
          })),
        },
      ] as FilterQuery<T>[]);
    }

    return this;
  }

  // filter method -2
  filter() {
    const queryObj = stripUnsafeOperators({ ...this.query }) as Record<
      string,
      unknown
    >;
    const excludedFields = ['searchTerm', 'sort', 'limit', 'page', 'fields'];

    excludedFields.forEach((el) => delete queryObj[el]);

    this.modelQuery = this.modelQuery.find(queryObj as FilterQuery<T>);

    return this;
  }

  // sort method -3
  sort() {
    const sort =
      (this.query?.sort as string)?.split(',')?.join(' ') || '-createdAt';

    this.modelQuery = this.modelQuery.sort(sort);

    return this;
  }

  // paginate method -4
  paginate() {
    const rawLimit = Number(this.query?.limit);
    const rawPage = Number(this.query?.page);

    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT)
        : DEFAULT_PAGE_LIMIT;
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const skip = (page - 1) * limit;

    this.modelQuery = this.modelQuery.skip(skip).limit(limit);

    return this;
  }

  // fields method -5
  fields() {
    const fields =
      (this.query?.fields as string)?.split(',')?.join(' ') || '-__v';

    this.modelQuery = this.modelQuery.select(fields);

    return this;
  }

  async countTotal() {
    const totalQueries = this.modelQuery.getFilter();
    const total = await this.modelQuery.model.countDocuments(totalQueries);
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this?.query?.limit) || DEFAULT_PAGE_LIMIT;
    const totalPage = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPage,
    };
  }
}

export default QueryBuilder;
