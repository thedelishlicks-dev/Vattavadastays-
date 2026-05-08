/* eslint-disable @typescript-eslint/no-empty-object-type */
export interface Property {}
export interface Room {}
export interface Availability {}
export interface Booking {}

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: Property;
      };
      rooms: {
        Row: Room;
      };
      availability: {
        Row: Availability;
      };
      bookings: {
        Row: Booking;
      };
    };
  };
}
