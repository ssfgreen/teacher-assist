import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "teachers" })
export class TeacherEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "text", unique: true })
  email!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "password_hash", type: "text" })
  passwordHash!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
