// Shapes follow the class diagram in the project report.
export type RequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type RideStatus = "PENDING" | "ONGOING" | "COMPLETED" | "CANCELLED";
export type ActivityStatus = "UPCOMING" | "ONGOING" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

export type ActivityType = "SPORTS" | "WALK" | "GYM" | "FOOD" | "MOVIE" | "STUDY" | "HANGOUT" | "OTHER";

export type Person = { id: string; name: string; hostel: string; branch: string; year?: number | null; avatarUrl?: string | null; upiId?: string; ratingAvg?: number | null; ratingCount?: number };

export type Profile = {
  id: "me";
  userId?: number;
  ratingAvg?: number | null;
  ratingCount?: number;
  email: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  name: string;
  branch: string;
  year: number;
  hostel: string;
  phone: string;
  upiId: string;
};

export type Ride = {
  id: string;
  creatorId: string;
  source: string;
  destination: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  totalSeats: number; // seats offered to other students (the creator is not counted)
  expectedFare: number; // total fare in INR
  actualFare?: number; // entered when the ride is completed
  status: RideStatus;
  participants: string[]; // accepted riders, creator excluded
  note?: string;
  srcLat?: number | null; // map points, when the creator set them
  srcLng?: number | null;
  dstLat?: number | null;
  dstLng?: number | null;
  seriesId?: string | null; // rides created together as a repeating series
  createdOn: number;
};

export type RideRequest = { id: string; rideId: string; requesterId: string; status: RequestStatus; requestedOn: number; restricted?: boolean };

export type Payment = {
  id: string;
  rideId: string;
  studentId: string;
  amount: number;
  status: PaymentStatus;
  riderMarkedPaid: boolean;
  paidOn?: number;
};

export type ChatMessage = { id: string; authorId: string; text: string; at: number };

export type Activity = {
  id: string;
  creatorId: string;
  title: string;
  type: ActivityType;
  location: string;
  date: string;
  time: string;
  description: string;
  maxParticipants: number; // includes the creator
  status: ActivityStatus;
  participants: string[]; // accepted students, creator excluded
  messages: ChatMessage[];
  createdOn: number;
};

export type ActivityRequest = { id: string; activityId: string; requesterId: string; status: RequestStatus; requestedOn: number; restricted?: boolean };

export type AppNotification = { id: string; text: string; href?: string; at: number; read: boolean };

export type Report = { id: string; kind: "ride" | "activity"; targetId: string; targetTitle: string; reason: string; at: number };

export type Settings = {
  defaultPickup: string; // prefilled in "Offer a ride"
  defaultSeats: number; // prefilled free seats
  defaultActivityType: ActivityType; // prefilled in "Post an activity"
  notifyIncoming: boolean; // someone asks to join my ride or activity
  notifyAnswers: boolean; // someone answers my request
  reduceMotion: boolean;
  showYear: boolean; // privacy: what other students can see
  showBranch: boolean;
  showHostel: boolean;
  showPhoto: boolean;
  reminderMinutes: number; // 0 = off
  emailReminders: boolean;
};

export type MyRating = { rideId: string; rateeId: string; stars: number };
export type ReceivedRating = { id: string; stars: number; comment: string | null; at: number; rideTitle: string };

export type RelPerson = { id: string; name: string; avatarUrl?: string | null };
export type Relations = { blocked: RelPerson[]; restricted: RelPerson[] };

export type Snapshot = {
  me: Profile;
  people: Person[];
  rides: Ride[];
  rideRequests: RideRequest[];
  payments: Payment[];
  activities: Activity[];
  activityRequests: ActivityRequest[];
  notifications: AppNotification[];
  reports: Report[];
  settings: Settings;
  relations: Relations;
  myRatings: MyRating[];
  receivedRatings: ReceivedRating[];
};
