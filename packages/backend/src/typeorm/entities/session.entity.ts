import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "sessions" })
export class SessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "teacher_id", type: "uuid" })
  teacherId!: string;

  @Column({ type: "text", nullable: true })
  command!: string | null;

  @Column({ name: "agent_name", type: "text", nullable: true })
  agentName!: string | null;

  @Column({ type: "text" })
  provider!: string;

  @Column({ type: "text" })
  model!: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  messages!: unknown;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  tasks!: unknown;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
