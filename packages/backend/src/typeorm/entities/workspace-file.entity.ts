import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "workspace_files" })
export class WorkspaceFileEntity {
  @PrimaryColumn({ name: "teacher_id", type: "uuid" })
  teacherId!: string;

  @PrimaryColumn({ type: "text" })
  path!: string;

  @Column({ type: "text" })
  content!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
