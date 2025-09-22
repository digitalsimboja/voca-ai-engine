# Voca AI Engine - Terraform Outputs

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.voca_vpc.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public_subnets[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private_subnets[*].id
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.voca_alb.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.voca_alb.zone_id
}

output "rds_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.voca_rds.endpoint
}

output "rds_reader_endpoint" {
  description = "RDS cluster reader endpoint"
  value       = aws_rds_cluster.voca_rds.reader_endpoint
}

output "ecs_cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.voca_cluster.id
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.voca_cluster.arn
}

output "target_group_arns" {
  description = "Target group ARNs"
  value = {
    voca_ai_engine = aws_lb_target_group.voca_ai_engine_tg.arn
    voca_os        = aws_lb_target_group.voca_os_tg.arn
    voca_connect   = aws_lb_target_group.voca_connect_tg.arn
  }
}

output "security_group_ids" {
  description = "Security group IDs"
  value = {
    alb = aws_security_group.alb_sg.id
    ecs = aws_security_group.ecs_sg.id
    rds = aws_security_group.rds_sg.id
  }
}
