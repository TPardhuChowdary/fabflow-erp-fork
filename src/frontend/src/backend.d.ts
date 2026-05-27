import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface DeliveryChallan {
    id: string;
    status: string;
    dcNo: string;
    createdAt: Time;
    soId: string;
    customerId: string;
    items: string;
}
export type Time = bigint;
export interface MaterialRequisition {
    id: string;
    totalEstimatedCost: bigint;
    status: string;
    mrNo: string;
    createdAt: Time;
    jobId: string;
    items: string;
}
export interface SalesOrderLineItem {
    qty: bigint;
    desc: string;
    unitPrice: bigint;
    amount: bigint;
}
export interface SalesOrder {
    id: string;
    status: SalesOrderStatus;
    lineItems: Array<SalesOrderLineItem>;
    createdAt: Time;
    poId: string;
    qtId: string;
    soNo: string;
    deliveryDate: Time;
    customerId: string;
    remarks: string;
}
export interface JobCard {
    id: string;
    drawingFileIds: Array<string>;
    jobDescription: string;
    createdAt: Time;
    soId: string;
    jobNo: string;
    customerId: string;
    materialRequisitionStatus: string;
}
export interface Payment {
    id: string;
    createdAt: Time;
    invoiceId: string;
    paymentDate: Time;
    amount: bigint;
}
export interface Invoice {
    id: string;
    status: string;
    createdAt: Time;
    customerId: string;
    invNo: string;
}
export interface Enquiry {
    id: string;
    status: EnquiryStatus;
    createdAt: Time;
    description: string;
    enqNo: string;
    targetDate: Time;
    customerId: string;
    items: string;
}
export interface Customer {
    id: string;
    name: string;
    createdAt: Time;
    contactPerson: string;
    email: string;
    gstin: string;
    address: string;
    phone: string;
}
export interface QuotationLineItem {
    hsn: string;
    qty: bigint;
    desc: string;
    unitPrice: bigint;
    amount: bigint;
}
export interface Quotation {
    id: string;
    status: QuotationStatus;
    lineItems: Array<QuotationLineItem>;
    terms: string;
    createdAt: Time;
    qtNo: string;
    enqId: string;
    gstAmount: bigint;
    totalAmount: bigint;
    customerId: string;
    gstRate: bigint;
    validUntil: Time;
    subtotal: bigint;
}
export interface EmployeeProfile {
    name: string;
    photo?: Uint8Array;
    roles: Array<AppRole>;
}
export interface PurchaseOrder {
    id: string;
    status: PurchaseOrderStatus;
    poAmount: bigint;
    createdAt: Time;
    qtId: string;
    customerId: string;
    poRef: string;
    poDate: Time;
}
export interface UserProfile {
    name: string;
    roles: Array<AppRole>;
}
export enum AppRole {
    qc = "qc",
    admin = "admin",
    production = "production",
    sales = "sales",
    accounts = "accounts"
}
export enum EnquiryStatus {
    new_ = "new",
    closed = "closed",
    quoted = "quoted",
    inProgress = "inProgress"
}
export enum PurchaseOrderStatus {
    cancelled = "cancelled",
    confirmed = "confirmed",
    received = "received"
}
export enum QuotationStatus {
    sent = "sent",
    rejected = "rejected",
    accepted = "accepted",
    draft = "draft"
}
export enum SalesOrderStatus {
    closed = "closed",
    open = "open",
    dispatched = "dispatched",
    inProduction = "inProduction",
    readyToDispatch = "readyToDispatch"
}
export interface backendInterface {
    addAdmin(user: Principal): Promise<void>;
    assignAppRoles(user: Principal, roles: Array<AppRole>): Promise<void>;
    createCustomer(name: string, contactPerson: string, phone: string, email: string, address: string, gstin: string): Promise<Customer>;
    createDeliveryChallan(id: string, dcNo: string, soId: string, customerId: string, items: string): Promise<DeliveryChallan>;
    createEmployeeProfile(profile: EmployeeProfile): Promise<void>;
    createEnquiry(enqNo: string, customerId: string, description: string, items: string, targetDate: Time): Promise<Enquiry>;
    createInvoice(id: string, invNo: string, customerId: string): Promise<Invoice>;
    createJobCard(id: string, jobNo: string, soId: string, customerId: string, jobDescription: string, drawingFileIds: Array<string>): Promise<JobCard>;
    createMaterialRequisition(id: string, mrNo: string, jobId: string, items: string, totalEstimatedCost: bigint): Promise<MaterialRequisition>;
    createPayment(id: string, invoiceId: string, amount: bigint, paymentDate: Time): Promise<Payment>;
    createPurchaseOrder(id: string, poRef: string, qtId: string, customerId: string, poDate: Time, poAmount: bigint): Promise<PurchaseOrder>;
    createQuotation(id: string, qtNo: string, enqId: string, customerId: string, lineItems: Array<QuotationLineItem>, subtotal: bigint, gstRate: bigint, gstAmount: bigint, totalAmount: bigint, validUntil: Time, terms: string): Promise<Quotation>;
    createSalesOrder(id: string, soNo: string, poId: string, customerId: string, qtId: string, lineItems: Array<SalesOrderLineItem>, deliveryDate: Time, remarks: string): Promise<SalesOrder>;
    fileExists(_fileName: string): Promise<boolean>;
    generateDocNo(prefix: string): Promise<string>;
    getAllCustomers(): Promise<Array<Customer>>;
    getAllDeliveryChallans(): Promise<Array<DeliveryChallan>>;
    getAllEmployeeProfiles(): Promise<Array<EmployeeProfile>>;
    getAllEnquiries(): Promise<Array<Enquiry>>;
    getAllInvoices(): Promise<Array<Invoice>>;
    getAllJobCards(): Promise<Array<JobCard>>;
    getAllMaterialRequisitions(): Promise<Array<MaterialRequisition>>;
    getAllPayments(): Promise<Array<Payment>>;
    getAllPurchaseOrders(): Promise<Array<PurchaseOrder>>;
    getAllQuotations(): Promise<Array<Quotation>>;
    getAllSalesOrders(): Promise<Array<SalesOrder>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCustomer(customerId: string): Promise<Customer | null>;
    getDeliveryChallan(dcId: string): Promise<DeliveryChallan | null>;
    getEmployeeProfile(employeeId: string): Promise<EmployeeProfile | null>;
    getEnquiry(enquiryId: string): Promise<Enquiry | null>;
    getInvoice(invoiceId: string): Promise<Invoice | null>;
    getJobCard(jobId: string): Promise<JobCard | null>;
    getMaterialRequisition(mrId: string): Promise<MaterialRequisition | null>;
    getPayment(paymentId: string): Promise<Payment | null>;
    getPurchaseOrder(poId: string): Promise<PurchaseOrder | null>;
    getQuotation(quotationId: string): Promise<Quotation | null>;
    getSalesOrder(soId: string): Promise<SalesOrder | null>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    hasDrawing(_fileName: string): Promise<boolean>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    updateEmployeeProfile(employeeId: string, profile: EmployeeProfile): Promise<void>;
}
