import Map "mo:core/Map";
import Text "mo:core/Text";
import List "mo:core/List";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Migration "migration";

(with migration = Migration.run)
actor {
  // ==== ROLES ====
  public type AppRole = {
    #admin;
    #sales;
    #production;
    #qc;
    #accounts;
  };

  // ==== AUTH STATE ====
  let admins = List.empty<Principal>();
  let appRoles = Map.empty<Principal, [AppRole]>();

  func isAdmin(caller : Principal) : Bool {
    admins.contains(caller);
  };

  func hasAnyAppRole(caller : Principal, roles : [AppRole]) : Bool {
    if (isAdmin(caller)) return true;
    switch (appRoles.get(caller)) {
      case (null) { false };
      case (?userRoles) {
        for (role in userRoles.values()) {
          for (target in roles.values()) {
            if (role == target) return true;
          };
        };
        false;
      };
    };
  };

  // ==== USER PROFILE TYPES ====
  public type UserProfile = {
    name : Text;
    roles : [AppRole];
  };

  public type EmployeeProfile = {
    name : Text;
    roles : [AppRole];
    photo : ?Blob;
  };

  let userProfiles = Map.empty<Principal, UserProfile>();
  let employeeProfiles = Map.empty<Text, EmployeeProfile>();

  // ==== ADMIN BOOTSTRAP ====
  public shared ({ caller }) func addAdmin(user : Principal) : async () {
    if (admins.size() > 0 and not isAdmin(caller)) {
      Runtime.trap("Unauthorized: Only existing admins can add admins");
    };
    if (not admins.contains(user)) {
      admins.add(user);
    };
  };

  public shared ({ caller }) func assignAppRoles(user : Principal, roles : [AppRole]) : async () {
    if (not isAdmin(caller)) {
      Runtime.trap("Unauthorized: Only admins can assign roles");
    };
    appRoles.add(user, roles);
  };

  // ==== USER PROFILE MANAGEMENT ====
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not isAdmin(caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    userProfiles.add(caller, profile);
    appRoles.add(caller, profile.roles);
  };

  public shared ({ caller }) func createEmployeeProfile(profile : EmployeeProfile) : async () {
    if (not hasAnyAppRole(caller, [#admin, #accounts])) {
      Runtime.trap("Unauthorized: Only Admin or Accounts can create employee profiles");
    };
    employeeProfiles.add(profile.name, profile);
  };

  public shared ({ caller }) func updateEmployeeProfile(employeeId : Text, profile : EmployeeProfile) : async () {
    if (not hasAnyAppRole(caller, [#admin, #accounts])) {
      Runtime.trap("Unauthorized: Only Admin or Accounts can update employee profiles");
    };
    employeeProfiles.add(employeeId, profile);
  };

  public query ({ caller = _ }) func getEmployeeProfile(employeeId : Text) : async ?EmployeeProfile {
    employeeProfiles.get(employeeId);
  };

  public query ({ caller = _ }) func getAllEmployeeProfiles() : async [EmployeeProfile] {
    employeeProfiles.values().toArray();
  };

  // ==== DOMAIN TYPES ====
  public type Customer = {
    id : Text;
    name : Text;
    contactPerson : Text;
    phone : Text;
    email : Text;
    address : Text;
    gstin : Text;
    createdAt : Time.Time;
  };

  public type EnquiryStatus = {
    #new;
    #inProgress;
    #quoted;
    #closed;
  };

  public type Enquiry = {
    id : Text;
    enqNo : Text;
    customerId : Text;
    description : Text;
    items : Text;
    targetDate : Time.Time;
    status : EnquiryStatus;
    createdAt : Time.Time;
  };

  public type QuotationStatus = {
    #draft;
    #sent;
    #accepted;
    #rejected;
  };

  public type QuotationLineItem = {
    desc : Text;
    qty : Nat;
    unitPrice : Nat;
    hsn : Text;
    amount : Nat;
  };

  public type Quotation = {
    id : Text;
    qtNo : Text;
    enqId : Text;
    customerId : Text;
    lineItems : [QuotationLineItem];
    subtotal : Nat;
    gstRate : Nat;
    gstAmount : Nat;
    totalAmount : Nat;
    validUntil : Time.Time;
    terms : Text;
    status : QuotationStatus;
    createdAt : Time.Time;
  };

  public type PurchaseOrderStatus = {
    #received;
    #confirmed;
    #cancelled;
  };

  public type PurchaseOrder = {
    id : Text;
    poRef : Text;
    qtId : Text;
    customerId : Text;
    poDate : Time.Time;
    poAmount : Nat;
    status : PurchaseOrderStatus;
    createdAt : Time.Time;
  };

  public type SalesOrderStatus = {
    #open;
    #inProduction;
    #readyToDispatch;
    #dispatched;
    #closed;
  };

  public type SalesOrderLineItem = {
    desc : Text;
    qty : Nat;
    unitPrice : Nat;
    amount : Nat;
  };

  public type SalesOrder = {
    id : Text;
    soNo : Text;
    poId : Text;
    customerId : Text;
    qtId : Text;
    lineItems : [SalesOrderLineItem];
    deliveryDate : Time.Time;
    remarks : Text;
    status : SalesOrderStatus;
    createdAt : Time.Time;
  };

  public type JobCard = {
    id : Text;
    jobNo : Text;
    soId : Text;
    customerId : Text;
    jobDescription : Text;
    drawingFileIds : [Text];
    materialRequisitionStatus : Text;
    createdAt : Time.Time;
  };

  public type MaterialRequisition = {
    id : Text;
    mrNo : Text;
    jobId : Text;
    items : Text;
    totalEstimatedCost : Nat;
    status : Text;
    createdAt : Time.Time;
  };

  public type DeliveryChallan = {
    id : Text;
    dcNo : Text;
    soId : Text;
    customerId : Text;
    items : Text;
    status : Text;
    createdAt : Time.Time;
  };

  public type Invoice = {
    id : Text;
    invNo : Text;
    customerId : Text;
    status : Text;
    createdAt : Time.Time;
  };

  public type Payment = {
    id : Text;
    invoiceId : Text;
    amount : Nat;
    paymentDate : Time.Time;
    createdAt : Time.Time;
  };

  // ==== STORAGE ====
  let customers = Map.empty<Text, Customer>();
  let enquiries = Map.empty<Text, Enquiry>();
  let quotations = Map.empty<Text, Quotation>();
  let purchaseOrders = Map.empty<Text, PurchaseOrder>();
  let salesOrders = Map.empty<Text, SalesOrder>();
  let jobCards = Map.empty<Text, JobCard>();
  let materialRequisitions = Map.empty<Text, MaterialRequisition>();
  let deliveryChallans = Map.empty<Text, DeliveryChallan>();
  let invoices = Map.empty<Text, Invoice>();
  let payments = Map.empty<Text, Payment>();

  let counters = Map.empty<Text, Nat>();

  // ==== DOC NUMBERING ====
  public shared ({ caller = _ }) func generateDocNo(prefix : Text) : async Text {
    let year = 2026;
    let counter = switch (counters.get(prefix)) {
      case (null) { 1 };
      case (?val) { val + 1 };
    };
    let seq = if (counter < 10) { "00" # counter.toText() }
              else if (counter < 100) { "0" # counter.toText() }
              else { counter.toText() };
    let docNo = prefix # "-" # year.toText() # "-" # seq;
    counters.add(prefix, counter);
    docNo;
  };

  // ==== CUSTOMER FUNCTIONS ====
  public shared ({ caller }) func createCustomer(name : Text, contactPerson : Text, phone : Text, email : Text, address : Text, gstin : Text) : async Customer {
    if (not hasAnyAppRole(caller, [#admin, #sales])) {
      Runtime.trap("Unauthorized: Only Admin or Sales can create customers");
    };
    let id = name # "-" # Time.now().toText();
    let customer : Customer = {
      id;
      name;
      contactPerson;
      phone;
      email;
      address;
      gstin;
      createdAt = Time.now();
    };
    customers.add(id, customer);
    customer;
  };

  public query ({ caller = _ }) func getCustomer(customerId : Text) : async ?Customer {
    customers.get(customerId);
  };

  // ==== ENQUIRY FUNCTIONS ====
  public shared ({ caller }) func createEnquiry(enqNo : Text, customerId : Text, description : Text, items : Text, targetDate : Time.Time) : async Enquiry {
    if (not hasAnyAppRole(caller, [#admin, #sales])) {
      Runtime.trap("Unauthorized: Only Admin or Sales can create enquiries");
    };
    let id = enqNo # "-" # Time.now().toText();
    let enquiry : Enquiry = {
      id;
      enqNo;
      customerId;
      description;
      items;
      targetDate;
      status = #new;
      createdAt = Time.now();
    };
    enquiries.add(id, enquiry);
    enquiry;
  };

  public query ({ caller = _ }) func getEnquiry(enquiryId : Text) : async ?Enquiry {
    enquiries.get(enquiryId);
  };

  // ==== QUOTATION FUNCTIONS ====
  public shared ({ caller }) func createQuotation(
    id : Text,
    qtNo : Text,
    enqId : Text,
    customerId : Text,
    lineItems : [QuotationLineItem],
    subtotal : Nat,
    gstRate : Nat,
    gstAmount : Nat,
    totalAmount : Nat,
    validUntil : Time.Time,
    terms : Text,
  ) : async Quotation {
    if (not hasAnyAppRole(caller, [#admin, #sales])) {
      Runtime.trap("Unauthorized: Only Admin or Sales can create quotations");
    };
    let quotation : Quotation = {
      id;
      qtNo;
      enqId;
      customerId;
      lineItems;
      subtotal;
      gstRate;
      gstAmount;
      totalAmount;
      validUntil;
      terms;
      status = #draft;
      createdAt = Time.now();
    };
    quotations.add(id, quotation);
    quotation;
  };

  public query ({ caller = _ }) func getQuotation(quotationId : Text) : async ?Quotation {
    quotations.get(quotationId);
  };

  // ==== PURCHASE ORDER FUNCTIONS ====
  public shared ({ caller }) func createPurchaseOrder(
    id : Text,
    poRef : Text,
    qtId : Text,
    customerId : Text,
    poDate : Time.Time,
    poAmount : Nat,
  ) : async PurchaseOrder {
    if (not hasAnyAppRole(caller, [#admin, #sales])) {
      Runtime.trap("Unauthorized: Only Admin or Sales can create purchase orders");
    };
    let purchaseOrder : PurchaseOrder = {
      id;
      poRef;
      qtId;
      customerId;
      poDate;
      poAmount;
      status = #received;
      createdAt = Time.now();
    };
    purchaseOrders.add(id, purchaseOrder);
    purchaseOrder;
  };

  public query ({ caller = _ }) func getPurchaseOrder(poId : Text) : async ?PurchaseOrder {
    purchaseOrders.get(poId);
  };

  // ==== SALES ORDER FUNCTIONS ====
  public shared ({ caller }) func createSalesOrder(
    id : Text,
    soNo : Text,
    poId : Text,
    customerId : Text,
    qtId : Text,
    lineItems : [SalesOrderLineItem],
    deliveryDate : Time.Time,
    remarks : Text,
  ) : async SalesOrder {
    if (not hasAnyAppRole(caller, [#admin, #sales])) {
      Runtime.trap("Unauthorized: Only Admin or Sales can create sales orders");
    };
    let salesOrder : SalesOrder = {
      id;
      soNo;
      poId;
      customerId;
      qtId;
      lineItems;
      deliveryDate;
      remarks;
      status = #open;
      createdAt = Time.now();
    };
    salesOrders.add(id, salesOrder);
    salesOrder;
  };

  public query ({ caller = _ }) func getSalesOrder(soId : Text) : async ?SalesOrder {
    salesOrders.get(soId);
  };

  // ==== JOB CARD FUNCTIONS ====
  public shared ({ caller }) func createJobCard(
    id : Text,
    jobNo : Text,
    soId : Text,
    customerId : Text,
    jobDescription : Text,
    drawingFileIds : [Text],
  ) : async JobCard {
    if (not hasAnyAppRole(caller, [#admin, #production])) {
      Runtime.trap("Unauthorized: Only Admin or Production can create job cards");
    };
    let jobCard : JobCard = {
      id;
      jobNo;
      soId;
      customerId;
      jobDescription;
      drawingFileIds;
      materialRequisitionStatus = "Pending";
      createdAt = Time.now();
    };
    jobCards.add(id, jobCard);
    jobCard;
  };

  public query ({ caller = _ }) func getJobCard(jobId : Text) : async ?JobCard {
    jobCards.get(jobId);
  };

  // ==== MATERIAL REQUISITION FUNCTIONS ====
  public shared ({ caller }) func createMaterialRequisition(
    id : Text,
    mrNo : Text,
    jobId : Text,
    items : Text,
    totalEstimatedCost : Nat,
  ) : async MaterialRequisition {
    if (not hasAnyAppRole(caller, [#admin, #production])) {
      Runtime.trap("Unauthorized: Only Admin or Production can create material requisitions");
    };
    let mr : MaterialRequisition = {
      id;
      mrNo;
      jobId;
      items;
      totalEstimatedCost;
      status = "Draft";
      createdAt = Time.now();
    };
    materialRequisitions.add(id, mr);
    mr;
  };

  public query ({ caller = _ }) func getMaterialRequisition(mrId : Text) : async ?MaterialRequisition {
    materialRequisitions.get(mrId);
  };

  // ==== DELIVERY CHALLAN FUNCTIONS ====
  public shared ({ caller }) func createDeliveryChallan(
    id : Text,
    dcNo : Text,
    soId : Text,
    customerId : Text,
    items : Text,
  ) : async DeliveryChallan {
    if (not hasAnyAppRole(caller, [#admin, #production])) {
      Runtime.trap("Unauthorized: Only Admin or Production can create delivery challans");
    };
    let deliveryChallan : DeliveryChallan = {
      id;
      dcNo;
      soId;
      customerId;
      items;
      status = "Prepared";
      createdAt = Time.now();
    };
    deliveryChallans.add(id, deliveryChallan);
    deliveryChallan;
  };

  public query ({ caller = _ }) func getDeliveryChallan(dcId : Text) : async ?DeliveryChallan {
    deliveryChallans.get(dcId);
  };

  // ==== INVOICE FUNCTIONS ====
  public shared ({ caller }) func createInvoice(
    id : Text,
    invNo : Text,
    customerId : Text,
  ) : async Invoice {
    if (not hasAnyAppRole(caller, [#admin, #accounts])) {
      Runtime.trap("Unauthorized: Only Admin or Accounts can create invoices");
    };
    let invoice : Invoice = {
      id;
      invNo;
      customerId;
      status = "Unpaid";
      createdAt = Time.now();
    };
    invoices.add(id, invoice);
    invoice;
  };

  public query ({ caller = _ }) func getInvoice(invoiceId : Text) : async ?Invoice {
    invoices.get(invoiceId);
  };

  // ==== PAYMENT FUNCTIONS ====
  public shared ({ caller }) func createPayment(
    id : Text,
    invoiceId : Text,
    amount : Nat,
    paymentDate : Time.Time,
  ) : async Payment {
    if (not hasAnyAppRole(caller, [#admin, #accounts])) {
      Runtime.trap("Unauthorized: Only Admin or Accounts can create payments");
    };
    let payment : Payment = {
      id;
      invoiceId;
      amount;
      paymentDate;
      createdAt = Time.now();
    };
    payments.add(id, payment);
    payment;
  };

  public query ({ caller = _ }) func getPayment(paymentId : Text) : async ?Payment {
    payments.get(paymentId);
  };

  // ==== GET ALL FUNCTIONS ====
  public query ({ caller = _ }) func getAllCustomers() : async [Customer] {
    customers.values().toArray().sort<Customer>(func(a, b) {
      switch (Text.compare(a.name, b.name)) {
        case (#equal) { Text.compare(a.id, b.id) };
        case (order) { order };
      };
    });
  };

  public query ({ caller = _ }) func getAllEnquiries() : async [Enquiry] {
    enquiries.values().toArray().sort<Enquiry>(func(a, b) {
      switch (Text.compare(a.enqNo, b.enqNo)) {
        case (#equal) { Text.compare(a.id, b.id) };
        case (order) { order };
      };
    });
  };

  public query ({ caller = _ }) func getAllQuotations() : async [Quotation] {
    quotations.values().toArray();
  };

  public query ({ caller = _ }) func getAllPurchaseOrders() : async [PurchaseOrder] {
    purchaseOrders.values().toArray();
  };

  public query ({ caller = _ }) func getAllSalesOrders() : async [SalesOrder] {
    salesOrders.values().toArray();
  };

  public query ({ caller = _ }) func getAllJobCards() : async [JobCard] {
    jobCards.values().toArray();
  };

  public query ({ caller = _ }) func getAllMaterialRequisitions() : async [MaterialRequisition] {
    materialRequisitions.values().toArray();
  };

  public query ({ caller = _ }) func getAllDeliveryChallans() : async [DeliveryChallan] {
    deliveryChallans.values().toArray();
  };

  public query ({ caller = _ }) func getAllInvoices() : async [Invoice] {
    invoices.values().toArray();
  };

  public query ({ caller = _ }) func getAllPayments() : async [Payment] {
    payments.values().toArray();
  };

  // ==== FILE EXISTENCE CHECK ====
  public query ({ caller = _ }) func fileExists(_fileName : Text) : async Bool {
    true;
  };

  public query ({ caller = _ }) func hasDrawing(_fileName : Text) : async Bool {
    true;
  };
};
