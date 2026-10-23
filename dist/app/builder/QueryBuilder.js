"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const MAX_PAGE_LIMIT = 500;
const DEFAULT_PAGE_LIMIT = 100;
// Recursively drop MongoDB operator keys ($..., dotted paths) from user input
// so values like ?media[$ne]=x cannot smuggle operators into queries.
const stripUnsafeOperators = (value) => {
    if (Array.isArray(value)) {
        return value.map(stripUnsafeOperators);
    }
    if (value && typeof value === 'object') {
        const sanitized = {};
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
const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
class QueryBuilder {
    constructor(modelQuery, query) {
        this.modelQuery = modelQuery;
        this.query = query;
    }
    // search method -1
    search(searchingFields) {
        var _a;
        const searchTerm = (_a = this.query) === null || _a === void 0 ? void 0 : _a.searchTerm;
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
            ]);
        }
        return this;
    }
    // filter method -2
    filter() {
        const queryObj = stripUnsafeOperators(Object.assign({}, this.query));
        const excludedFields = ['searchTerm', 'sort', 'limit', 'page', 'fields'];
        excludedFields.forEach((el) => delete queryObj[el]);
        this.modelQuery = this.modelQuery.find(queryObj);
        return this;
    }
    // sort method -3
    sort() {
        var _a, _b, _c;
        const sort = ((_c = (_b = (_a = this.query) === null || _a === void 0 ? void 0 : _a.sort) === null || _b === void 0 ? void 0 : _b.split(',')) === null || _c === void 0 ? void 0 : _c.join(' ')) || '-createdAt';
        this.modelQuery = this.modelQuery.sort(sort);
        return this;
    }
    // paginate method -4
    paginate() {
        var _a, _b;
        const rawLimit = Number((_a = this.query) === null || _a === void 0 ? void 0 : _a.limit);
        const rawPage = Number((_b = this.query) === null || _b === void 0 ? void 0 : _b.page);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT)
            : DEFAULT_PAGE_LIMIT;
        const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
        const skip = (page - 1) * limit;
        this.modelQuery = this.modelQuery.skip(skip).limit(limit);
        return this;
    }
    // fields method -5
    fields() {
        var _a, _b, _c;
        const fields = ((_c = (_b = (_a = this.query) === null || _a === void 0 ? void 0 : _a.fields) === null || _b === void 0 ? void 0 : _b.split(',')) === null || _c === void 0 ? void 0 : _c.join(' ')) || '-__v';
        this.modelQuery = this.modelQuery.select(fields);
        return this;
    }
    countTotal() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const totalQueries = this.modelQuery.getFilter();
            const total = yield this.modelQuery.model.countDocuments(totalQueries);
            const page = Number((_a = this === null || this === void 0 ? void 0 : this.query) === null || _a === void 0 ? void 0 : _a.page) || 1;
            const limit = Number((_b = this === null || this === void 0 ? void 0 : this.query) === null || _b === void 0 ? void 0 : _b.limit) || DEFAULT_PAGE_LIMIT;
            const totalPage = Math.ceil(total / limit);
            return {
                page,
                limit,
                total,
                totalPage,
            };
        });
    }
}
exports.default = QueryBuilder;
